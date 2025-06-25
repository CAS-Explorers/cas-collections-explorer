import { getCountryFromCode } from "../utils/countryUtils";
import { query } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { Plant } from "./schema";
import { paginationOptsValidator } from "convex/server";
import { mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

export type SearchRule = {
  field: string;
  operator: string;
  value: string | number;
  secondValue?: number;
};

type SearchField = "scientificName" | "family" | "order" | "class" | "genus" | "species" | "country" | "state" | "county" | "collectors" | "continent" | "determinedDate" | "determiner" | "habitat" | "herbarium" | "localityName" | "phenology" | "preparations" | "town" | "typeStatusName" | "verbatimDate";
type SearchIndex = `search_${SearchField}`;
type CoordinateField = "longitude1" | "latitude1" | "barCode" | "accessionNumber" | "minElevation" | "maxElevation" | "startDateMonth" | "startDateDay" | "startDateYear" | "endDateMonth" | "endDateDay" | "endDateYear";
type SortableField =
  // All fields are now sortable on the server
  "scientificName" | "family" | "order" | "class" | "genus" | "species" | "country" | "state" | "county" |
  "barCode" | "accessionNumber" | "longitude1" | "latitude1" | "minElevation" | "maxElevation" |
  "startDateMonth" | "startDateDay" | "startDateYear" | "endDateMonth" | "endDateDay" | "endDateYear" |
  "collectors" | "continent" | "determinedDate" | "determiner" | "habitat" | "herbarium" |
  "localityName" | "phenology" | "preparations" | "town" | "typeStatusName" |
  "verbatimDate" | "timestampModified";

export const getPlantById = query({
  args: { id: v.id("botany") },
  handler: async (ctx, args) => {
    const plant = await ctx.db.get(args.id);
    return plant;
  },
});

// Add a simple count query for debugging
export const getTotalDocumentCount = query({
  args: {},
  handler: async (ctx) => {
    // This is a simple way to count all documents
    const allDocs = await ctx.db.query("botany").collect();
    return { total: allDocs.length };
  },
});

// Add a query to get sample country values
export const getSampleCountries = query({
  args: {},
  handler: async (ctx) => {
    const allDocs = await ctx.db.query("botany").collect();
    const countries = new Set(allDocs.map(doc => doc.country).filter(Boolean));
    const sampleCountries = Array.from(countries).slice(0, 20); // First 20 unique countries
    return { 
      totalDocuments: allDocs.length,
      uniqueCountries: countries.size,
      sampleCountries: sampleCountries.sort()
    };
  },
});

function getSearchId(rules: SearchRule[]): string {
  // Sort rules to ensure query 'a and b' has the same id as 'b and a'
  const sortedRules = [...rules].sort((a, b) => a.field.localeCompare(b.field));
  return JSON.stringify(sortedRules);
}

export const startMaterializingResults = mutation({
  args: {
    rules: v.array(
      v.object({
      field: v.string(),
      operator: v.string(),
      value: v.union(v.string(), v.number()),
      secondValue: v.optional(v.number()),
      })
    ),
    sort: v.object({
      field: v.string(),
      direction: v.string(),
    }),
  },
  handler: async (ctx, args) => {
    const searchId = getSearchId(args.rules);
    // Clean up any old accumulation docs for this searchId
    const oldAccumulations = await ctx.db.query("search_accumulation").withIndex("by_searchId", q => q.eq("searchId", searchId)).collect();
    for (const acc of oldAccumulations) {
      await ctx.db.delete(acc._id);
    }
    
    // Check if this is an unsorted query
    const isUnsorted = !args.sort.field || args.sort.field === "" || args.sort.field === "-";
    
    const existing = await ctx.db.query("search_results").withIndex("by_searchId", q => q.eq("searchId", searchId)).first();
    if (existing && JSON.stringify(existing.sort) === JSON.stringify(args.sort)) {
      return; // Already materialized with the same sort order.
    }
    await ctx.db.insert("search_counts", { searchId, total: -1 });
    await ctx.scheduler.runAfter(0, internal.botany._materializeSearchResults, {
      rules: args.rules,
      sort: args.sort, // Use the actual sort (including empty for unsorted)
      searchId,
      cursor: null,
    });
  }
});

export const _materializeSearchResults = internalMutation({
  args: {
    rules: v.array(
      v.object({
        field: v.string(),
        operator: v.string(),
        value: v.union(v.string(), v.number()),
        secondValue: v.optional(v.number()),
      })
    ),
    sort: v.object({
      field: v.string(),
      direction: v.string(),
    }),
    searchId: v.string(),
    cursor: v.union(v.null(), v.string()),
  },
  handler: async (ctx, { rules, sort, searchId, cursor }) => {
    try {
      console.log(`[MATERIALIZE] Running with rules:`, JSON.stringify(rules));
      console.log(`[MATERIALIZE] Cursor: ${cursor}, SearchId: ${searchId}`);
      
      const validRules = rules.filter(r => r.value !== undefined && r.value !== null && String(r.value).trim() !== "");
      console.log(`[MATERIALIZE] Valid rules:`, JSON.stringify(validRules));
      
      let queryBuilder = ctx.db.query("botany");
      const paginatedResults = await queryBuilder.paginate({ cursor, numItems: 1024 });
      console.log(`[MATERIALIZE] Page size: ${paginatedResults.page.length}, has more: ${!paginatedResults.isDone}, cursor: ${!!paginatedResults.continueCursor}`);
      
      // Log a few sample documents to see what we're working with
      if (cursor === null) { // Only on first page
        console.log(`[MATERIALIZE] Sample documents:`, paginatedResults.page.slice(0, 3).map(doc => ({ 
          id: doc._id, 
          country: doc.country,
          scientificName: doc.scientificName 
        })));
      }
      
      const filteredBatch = applyAllFilters(paginatedResults.page, validRules);
      console.log(`[MATERIALIZE] Filtered batch: ${filteredBatch.length} out of ${paginatedResults.page.length} total`);
      
      // Log sample filtered results
      if (filteredBatch.length > 0 && cursor === null) {
        console.log(`[MATERIALIZE] Sample filtered results:`, filteredBatch.slice(0, 3).map(doc => ({ 
          id: doc._id, 
          country: doc.country,
          scientificName: doc.scientificName 
        })));
      }
      
      // Get all accumulation docs for this searchId
      let accumulations = await ctx.db.query("search_accumulation").withIndex("by_searchId", q => q.eq("searchId", searchId)).collect();
      console.log(`[MATERIALIZE] Existing accumulation docs: ${accumulations.length}`);
      
      // Find or create a doc with space for more IDs
      let accumulation = accumulations.find(a => a.ids.length < 8000); // Leave some buffer
      if (!accumulation) {
        const newId = await ctx.db.insert("search_accumulation", { searchId, ids: [] });
        const newAccumulation = await ctx.db.get(newId);
        if (!newAccumulation) throw new Error("Failed to create accumulation doc");
        accumulation = newAccumulation;
        console.log(`[MATERIALIZE] Created new accumulation doc`);
      }
      
      // Add new IDs to accumulation
      const newIds = filteredBatch.map(p => p._id).filter(id => !accumulation!.ids.includes(id));
      const updatedIds = [...accumulation.ids, ...newIds];
      console.log(`[MATERIALIZE] Adding ${newIds.length} new IDs, total will be ${updatedIds.length}`);
      
      // Check if we're about to exceed the limit
      if (updatedIds.length > 8000) {
        // Split into chunks and create new accumulation docs
        const chunks = [];
        for (let i = 0; i < updatedIds.length; i += 8000) {
          chunks.push(updatedIds.slice(i, i + 8000));
        }
        
        // Update the first chunk in the current doc
        await ctx.db.patch(accumulation._id, { ids: chunks[0] });
        
        // Create new docs for additional chunks
        for (let i = 1; i < chunks.length; i++) {
          await ctx.db.insert("search_accumulation", { searchId, ids: chunks[i] });
        }
        console.log(`[MATERIALIZE] Split into ${chunks.length} accumulation docs`);
      } else {
        // Update accumulation doc normally
        await ctx.db.patch(accumulation._id, { ids: updatedIds });
      }
      
      console.log(`[MATERIALIZE] Batch: got ${filteredBatch.length} new, cursor: ${!!paginatedResults.continueCursor}, isDone: ${paginatedResults.isDone}`);
      
      if (paginatedResults.isDone) {
        // All pages processed, now schedule ultra-fast sorting
        console.log(`[MATERIALIZE] Processing complete. Scheduling ultra-fast sort job.`);
        
        // Schedule the ultra-fast sorting job
        await ctx.scheduler.runAfter(0, internal.botany._ultraFastSortResults, {
          searchId,
          sort,
        });
            } else {
        // Schedule next batch
        console.log(`[MATERIALIZE] Scheduling next batch with cursor: ${paginatedResults.continueCursor}`);
        await ctx.scheduler.runAfter(0, internal.botany._materializeSearchResults, {
          rules,
          sort,
          searchId,
          cursor: paginatedResults.continueCursor,
        });
      }
    } catch (error) {
      console.error(`[MATERIALIZE] Error in materialization:`, error);
      console.error(`[MATERIALIZE] Error details:`, {
        searchId,
        cursor,
        rules: JSON.stringify(rules)
      });
      throw error;
    }
  },
});

// Update the main sorting function to use the efficient approach
export const sortResults = internalMutation({
  args: {
    searchId: v.string(),
    sort: v.object({
      field: v.string(),
      direction: v.string(),
    }),
  },
  handler: async (ctx, { searchId, sort }) => {
    console.log(`[SORT] Starting sort for field: ${sort.field}, direction: ${sort.direction}`);
    
    // Use the new efficient sorting approach
    await ctx.scheduler.runAfter(0, internal.botany._efficientSortResults, {
      searchId,
      sort,
    });
  },
});

export const searchPlants = query({
  args: {
    rules: v.array(
      v.object({
        field: v.string(),
        operator: v.string(),
        value: v.union(v.string(), v.number()),
        secondValue: v.optional(v.number()),
      })
    ),
    sort: v.object({
      field: v.string(),
      direction: v.string(),
    }),
    pagination: v.object({
      pageNumber: v.number(),
      pageSize: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const searchId = getSearchId(args.rules);
    const materialization = await ctx.db
      .query("search_results")
      .withIndex("by_searchId", (q) => q.eq("searchId", searchId))
      .first();
    if (!materialization) {
      return null; // Results are not ready yet
    }
    
    // Handle unsorted case - if sort field is empty, use any existing sort
    const isUnsorted = !args.sort.field || args.sort.field === "" || args.sort.field === "-";
    if (!isUnsorted && JSON.stringify(materialization.sort) !== JSON.stringify(args.sort)) {
      // Sorting is different, we need to re-materialize with the new sort order.
      console.log(`[SEARCH] Sort order changed, need re-materialization`);
      console.log(`[SEARCH] Old sort:`, materialization.sort);
      console.log(`[SEARCH] New sort:`, args.sort);
      console.log(`[SEARCH] Search ID:`, searchId);
      // For now, we'll just return null and let the frontend trigger a new materialization.
      return null;
    }
    
    let pageIds: Id<"botany">[] = [];
    let allIds: Id<"botany">[] = [];
    if (materialization.hasMultipleChunks) {
      // Fetch from multiple chunks
      const allChunks = await ctx.db.query("search_result_chunks").withIndex("by_searchId", q => q.eq("searchId", searchId)).collect();
      const sortedChunks = allChunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
      // Merge and deduplicate all IDs
      const allIdsRaw = [materialization.results, ...sortedChunks.map(chunk => chunk.results)].flat();
      const seen = new Set();
      allIds = [];
      for (const id of allIdsRaw) {
        if (!seen.has(id)) {
          seen.add(id);
          allIds.push(id);
        }
      }
    } else {
      // Single chunk - use the main results
      allIds = materialization.results;
    }
    const total = allIds.length;
    const start = Math.min((args.pagination.pageNumber - 1) * args.pagination.pageSize, total);
    const end = Math.min(start + args.pagination.pageSize, total);
    pageIds = allIds.slice(start, end);

    // Debug logging for last page
    if (end === total) {
      console.log(`[SEARCH] Serving last page: start=${start}, end=${end}, total=${total}`);
      console.log(`[SEARCH] Last page IDs:`, pageIds);
    }
    
    const plants = await Promise.all(pageIds.map((id) => ctx.db.get(id)));
    const plantsById = new Map(plants.filter(Boolean).map(p => [p!._id, p]));
    const sortedPlants = pageIds.map(id => plantsById.get(id)).filter(Boolean);
    
    // Add debugging for scientific name sorting
    if (args.sort.field === 'scientificName' && sortedPlants.length > 0) {
      console.log(`[SEARCH] Returning ${sortedPlants.length} plants`);
      console.log(`[SEARCH] First 3 scientific names:`, sortedPlants.slice(0, 3).map(p => p?.scientificName));
      console.log(`[SEARCH] Sort field: ${args.sort.field}, direction: ${args.sort.direction}`);
    }
    
    return { page: sortedPlants };
  },
});

export const getTotal = query({
  args: {
    rules: v.array(
      v.object({
        field: v.string(),
        operator: v.string(),
        value: v.union(v.string(), v.number()),
        secondValue: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const searchId = getSearchId(args.rules);
    const result = await ctx.db.query("search_counts").withIndex("by_searchId", q => q.eq("searchId", searchId)).first();
    return result;
  }
});

// Add a debug query to check materialization status
export const debugMaterialization = query({
  args: {
    rules: v.array(
      v.object({
        field: v.string(),
        operator: v.string(),
        value: v.union(v.string(), v.number()),
        secondValue: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const searchId = getSearchId(args.rules);
    
    // Check accumulation status
    const accumulation = await ctx.db.query("search_accumulation").withIndex("by_searchId", q => q.eq("searchId", searchId)).first();
    
    // Check final results
    const results = await ctx.db.query("search_results").withIndex("by_searchId", q => q.eq("searchId", searchId)).first();
    
    // Check result chunks if they exist
    const resultChunks = await ctx.db.query("search_result_chunks").withIndex("by_searchId", q => q.eq("searchId", searchId)).collect();
    
    // Check count
    const count = await ctx.db.query("search_counts").withIndex("by_searchId", q => q.eq("searchId", searchId)).first();
    
    // Calculate total results from all chunks
    let totalResultCount = 0;
    if (results) {
      totalResultCount += results.results.length;
      if (results.hasMultipleChunks && resultChunks.length > 0) {
        totalResultCount += resultChunks.reduce((sum, chunk) => sum + chunk.results.length, 0);
      }
    }
    
        return {
      searchId,
      accumulation: accumulation ? { idCount: accumulation.ids.length } : null,
      results: results ? { 
        resultCount: results.results.length, 
        sort: results.sort,
        hasMultipleChunks: results.hasMultipleChunks,
        totalChunks: results.totalChunks
      } : null,
      resultChunks: resultChunks.length > 0 ? {
        chunkCount: resultChunks.length,
        totalChunkResults: resultChunks.reduce((sum, chunk) => sum + chunk.results.length, 0)
      } : null,
      count: count ? count.total : null,
      totalResultCount
    };
  }
});

//Use again if we need more space
// export const deletePlants = mutation({
//   args: {
//     ids: v.array(v.id("botany"))
//   },
//   handler: async (ctx, args) => {
//     const { ids } = args;
//     const BATCH_SIZE = 100;
    
//     // Delete in batches of 100
//     for (let i = 0; i < ids.length; i += BATCH_SIZE) {
//       const batch = ids.slice(i, i + BATCH_SIZE);
//       for (const id of batch) {
//         await ctx.db.delete(id);
//       }
//     }
    
//     return { deleted: ids.length };
//   }
// });

// Add this utility function for filtering
function applyAllFilters(documents: Doc<"botany">[], rules: SearchRule[]): Doc<"botany">[] {
  console.log(`[FILTER] Applying ${rules.length} rules to ${documents.length} documents`);
  
  return documents.filter(doc => {
    return rules.every(rule => {
      const fieldValue = doc[rule.field as keyof Doc<"botany">];
      const ruleValue = rule.value;
      
      console.log(`[FILTER] Checking rule: ${rule.field} ${rule.operator} ${ruleValue}`);
      console.log(`[FILTER] Document ${rule.field}: "${fieldValue}" (type: ${typeof fieldValue})`);
      
      switch (rule.operator) {
        case "=":
          const exactMatch = fieldValue === ruleValue;
          console.log(`[FILTER] Exact match: ${exactMatch}`);
          return exactMatch;
        case "contains":
          const containsMatch = String(fieldValue).toLowerCase().includes(String(ruleValue).toLowerCase());
          console.log(`[FILTER] Contains match: ${containsMatch}`);
          return containsMatch;
        case "starts_with":
          return String(fieldValue).toLowerCase().startsWith(String(ruleValue).toLowerCase());
        case "ends_with":
          return String(fieldValue).toLowerCase().endsWith(String(ruleValue).toLowerCase());
        case ">":
          return Number(fieldValue) > Number(ruleValue);
        case ">=":
          return Number(fieldValue) >= Number(ruleValue);
        case "<":
          return Number(fieldValue) < Number(ruleValue);
        case "<=":
          return Number(fieldValue) <= Number(ruleValue);
        case "between":
          return Number(fieldValue) >= Number(rule.secondValue) && Number(fieldValue) <= Number(rule.secondValue);
        default:
          return true;
      }
    });
  });
}

// Add a simple test query to check Mexico documents
export const testMexicoSearch = query({
  args: {},
  handler: async (ctx) => {
    const allDocs = await ctx.db.query("botany").collect();
    const mexicoDocs = allDocs.filter(doc => 
      doc.country && String(doc.country).toLowerCase().includes("mexico")
    );
    
    console.log(`[TEST] Total docs: ${allDocs.length}`);
    console.log(`[TEST] Mexico docs: ${mexicoDocs.length}`);
    console.log(`[TEST] Sample Mexico docs:`, mexicoDocs.slice(0, 5).map(doc => ({
      id: doc._id,
      country: doc.country,
      scientificName: doc.scientificName
    })));
    
    return {
      totalDocs: allDocs.length,
      mexicoDocs: mexicoDocs.length,
      sampleMexicoDocs: mexicoDocs.slice(0, 5).map(doc => ({
        id: doc._id,
        country: doc.country,
        scientificName: doc.scientificName
      }))
    };
  },
});

// Add a simple mutation to manually trigger materialization for debugging
export const triggerMaterialization = mutation({
  args: {
    rules: v.array(
      v.object({
        field: v.string(),
        operator: v.string(),
        value: v.union(v.string(), v.number()),
        secondValue: v.optional(v.number()),
      })
    ),
    sort: v.object({
      field: v.string(),
      direction: v.string(),
    }),
  },
  handler: async (ctx, args) => {
    console.log(`[TRIGGER] Starting materialization for rules:`, JSON.stringify(args.rules));
    
    const searchId = getSearchId(args.rules);
    console.log(`[TRIGGER] Search ID: ${searchId}`);
    
    // Clean up any old accumulation docs for this searchId
    const oldAccumulations = await ctx.db.query("search_accumulation").withIndex("by_searchId", q => q.eq("searchId", searchId)).collect();
    console.log(`[TRIGGER] Cleaning up ${oldAccumulations.length} old accumulation docs`);
    for (const acc of oldAccumulations) {
      await ctx.db.delete(acc._id);
    }
    
    const existing = await ctx.db.query("search_results").withIndex("by_searchId", q => q.eq("searchId", searchId)).first();
    if (existing && JSON.stringify(existing.sort) === JSON.stringify(args.sort)) {
      console.log(`[TRIGGER] Already materialized with same sort order`);
      return { message: "Already materialized" };
    }
    
    await ctx.db.insert("search_counts", { searchId, total: -1 });
    console.log(`[TRIGGER] Scheduled materialization job`);
    
    await ctx.scheduler.runAfter(0, internal.botany._materializeSearchResults, {
      rules: args.rules,
      sort: args.sort,
      searchId,
      cursor: null,
    });
    
    return { message: "Materialization started", searchId };
  }
});

// Add a mutation to force clear existing results and restart materialization
export const forceRestartMaterialization = mutation({
  args: {
    rules: v.array(
      v.object({
        field: v.string(),
        operator: v.string(),
        value: v.union(v.string(), v.number()),
        secondValue: v.optional(v.number()),
      })
    ),
    sort: v.object({
      field: v.string(),
      direction: v.string(),
    }),
  },
  handler: async (ctx, args) => {
    console.log(`[FORCE] Force restarting materialization for rules:`, JSON.stringify(args.rules));
    
    const searchId = getSearchId(args.rules);
    console.log(`[FORCE] Search ID: ${searchId}`);
    
    // Clean up ALL existing data for this searchId
    const oldAccumulations = await ctx.db.query("search_accumulation").withIndex("by_searchId", q => q.eq("searchId", searchId)).collect();
    console.log(`[FORCE] Cleaning up ${oldAccumulations.length} accumulation docs`);
    for (const acc of oldAccumulations) {
      await ctx.db.delete(acc._id);
    }
    
    const oldResults = await ctx.db.query("search_results").withIndex("by_searchId", q => q.eq("searchId", searchId)).collect();
    console.log(`[FORCE] Cleaning up ${oldResults.length} result docs`);
    for (const result of oldResults) {
      await ctx.db.delete(result._id);
    }
    
    const oldChunks = await ctx.db.query("search_result_chunks").withIndex("by_searchId", q => q.eq("searchId", searchId)).collect();
    console.log(`[FORCE] Cleaning up ${oldChunks.length} result chunk docs`);
    for (const chunk of oldChunks) {
      await ctx.db.delete(chunk._id);
    }
    
    const oldCounts = await ctx.db.query("search_counts").withIndex("by_searchId", q => q.eq("searchId", searchId)).collect();
    console.log(`[FORCE] Cleaning up ${oldCounts.length} count docs`);
    for (const count of oldCounts) {
      await ctx.db.delete(count._id);
    }
    
    const oldSortedChunks = await ctx.db.query("search_sorted_chunks").withIndex("by_searchId", q => q.eq("searchId", searchId)).collect();
    console.log(`[FORCE] Cleaning up ${oldSortedChunks.length} sorted chunk docs`);
    for (const chunk of oldSortedChunks) {
      await ctx.db.delete(chunk._id);
    }
    
    // Start fresh materialization
    await ctx.db.insert("search_counts", { searchId, total: -1 });
    console.log(`[FORCE] Starting fresh materialization`);
    
    await ctx.scheduler.runAfter(0, internal.botany._materializeSearchResults, {
      rules: args.rules,
      sort: args.sort,
      searchId,
      cursor: null,
    });
    
    return { message: "Force restart completed", searchId };
  }
});

// Add an efficient indexed sorting function
export const _efficientSortResults = internalMutation({
  args: {
    searchId: v.string(),
    sort: v.object({
      field: v.string(),
      direction: v.string(),
    }),
    batchIndex: v.optional(v.number()),
  },
  handler: async (ctx, { searchId, sort, batchIndex }) => {
    console.log(`[EFFICIENT_SORT] Starting efficient sort for field: ${sort.field}, batch: ${batchIndex ?? 0}`);
    
    // Get the search rules from the searchId
    let searchRules: SearchRule[] = [];
    try {
      searchRules = JSON.parse(searchId);
    } catch (e) {
      console.error(`[EFFICIENT_SORT] Failed to parse searchId: ${searchId}`);
      return;
    }
    
    // For unsorted results, just save the accumulated IDs
    if (!sort.field || sort.field === "" || sort.field === "-") {
      console.log(`[EFFICIENT_SORT] Skipping sort for unsorted results`);
      const accumulations = await ctx.db.query("search_accumulation").withIndex("by_searchId", q => q.eq("searchId", searchId)).collect();
      const allIds = accumulations.flatMap(a => a.ids);
      // Global deduplication before chunking
      const uniqueIds = Array.from(new Set(allIds));
      // Clean up all old chunks before writing new ones
      await cleanupOldChunks(ctx, searchId);
      // Store results in chunks
      const FINAL_CHUNK_SIZE = 8000;
      const finalChunks = [];
      for (let i = 0; i < uniqueIds.length; i += FINAL_CHUNK_SIZE) {
        finalChunks.push(uniqueIds.slice(i, i + FINAL_CHUNK_SIZE));
      }
      // Save final results
      const existingResult = await ctx.db.query("search_results").withIndex("by_searchId", q => q.eq("searchId", searchId)).first();
      if (existingResult) {
        await ctx.db.patch(existingResult._id, {
          results: finalChunks[0],
          sort,
          totalChunks: finalChunks.length,
          hasMultipleChunks: finalChunks.length > 1
        });
        for (let i = 1; i < finalChunks.length; i++) {
          await ctx.db.insert("search_result_chunks", {
            searchId,
            chunkIndex: i,
            results: finalChunks[i]
          });
        }
      } else {
        await ctx.db.insert("search_results", {
          searchId,
          results: finalChunks[0],
          sort,
          totalChunks: finalChunks.length,
          hasMultipleChunks: finalChunks.length > 1
        });
        for (let i = 1; i < finalChunks.length; i++) {
          await ctx.db.insert("search_result_chunks", {
            searchId,
            chunkIndex: i,
            results: finalChunks[i]
          });
        }
      }
      // Update count
      const existingCount = await ctx.db.query("search_counts").withIndex("by_searchId", q => q.eq("searchId", searchId)).first();
      if (existingCount) {
        await ctx.db.patch(existingCount._id, { total: uniqueIds.length });
      }
      // Clean up
      for (const acc of accumulations) {
        await ctx.db.delete(acc._id);
      }
      console.log(`[EFFICIENT_SORT] Complete! Saved ${uniqueIds.length} unsorted results`);
      return;
    }
    
    // Get all accumulated IDs
    const accumulations = await ctx.db.query("search_accumulation").withIndex("by_searchId", q => q.eq("searchId", searchId)).collect();
    const allIds = accumulations.flatMap(a => a.ids);
    const uniqueIds: Id<"botany">[] = Array.from(new Set(allIds));
    
    console.log(`[EFFICIENT_SORT] Total unique IDs to sort: ${uniqueIds.length}`);
    
    // For small to medium datasets (≤5000), use client-side sorting as recommended by Convex
    if (uniqueIds.length <= 5000) {
      console.log(`[EFFICIENT_SORT] Small dataset (${uniqueIds.length} IDs), using client-side sorting as recommended by Convex`);
      // Fetch all documents in one go (Convex says this is fast for ≤5k documents)
      const docs = await Promise.all(uniqueIds.map(id => ctx.db.get(id)));
      const validDocs = docs.filter(Boolean) as Doc<"botany">[];
      // Sort using TypeScript (Convex says this is very fast)
      const sortedDocs = validDocs.sort((a, b) => {
        const fieldA = (a as any)[sort.field as SortableField];
        const fieldB = (b as any)[sort.field as SortableField];
        if (sort.field === 'scientificName') {
          console.log(`[EFFICIENT_SORT] Comparing: "${fieldA}" vs "${fieldB}"`);
        }
        if (fieldA == null) return 1; if (fieldB == null) return -1;
        if (typeof fieldA === 'number' && typeof fieldB === 'number') return sort.direction === 'asc' ? fieldA - fieldB : fieldB - fieldA;
        const stringA = String(fieldA).toLowerCase();
        const stringB = String(fieldB).toLowerCase();
        if (stringA < stringB) return sort.direction === 'asc' ? -1 : 1;
        if (stringA > stringB) return sort.direction === 'asc' ? 1 : -1;
        return 0;
      });
      // Global deduplication before chunking
      const sortedIds: Id<"botany">[] = sortedDocs.map((doc: Doc<"botany">) => doc._id);
      const uniqueSortedIds: Id<"botany">[] = Array.from(new Set(sortedIds));
      // Clean up all old chunks before writing new ones
      await cleanupOldChunks(ctx, searchId);
      // Store results in chunks
      const FINAL_CHUNK_SIZE = 8000;
      const finalChunks: Id<"botany">[][] = [];
      for (let i = 0; i < uniqueSortedIds.length; i += FINAL_CHUNK_SIZE) {
        finalChunks.push(uniqueSortedIds.slice(i, i + FINAL_CHUNK_SIZE));
      }
      // Save final results
      const existingResult = await ctx.db.query("search_results").withIndex("by_searchId", q => q.eq("searchId", searchId)).first();
      if (existingResult) {
        await ctx.db.patch(existingResult._id, {
          results: finalChunks[0],
          sort,
          totalChunks: finalChunks.length,
          hasMultipleChunks: finalChunks.length > 1
        });
        for (let i = 1; i < finalChunks.length; i++) {
          await ctx.db.insert("search_result_chunks", {
            searchId,
            chunkIndex: i,
            results: finalChunks[i]
          });
        }
      } else {
        await ctx.db.insert("search_results", {
          searchId,
          results: finalChunks[0],
          sort,
          totalChunks: finalChunks.length,
          hasMultipleChunks: finalChunks.length > 1
        });
        for (let i = 1; i < finalChunks.length; i++) {
          await ctx.db.insert("search_result_chunks", {
            searchId,
            chunkIndex: i,
            results: finalChunks[i]
          });
        }
      }
      // Update count
      const existingCount = await ctx.db.query("search_counts").withIndex("by_searchId", q => q.eq("searchId", searchId)).first();
      if (existingCount) {
        await ctx.db.patch(existingCount._id, { total: sortedIds.length });
      }
      
      // Clean up accumulation docs
      for (const acc of accumulations) {
        await ctx.db.delete(acc._id);
      }
      
      console.log(`[EFFICIENT_SORT] Complete! Saved ${sortedIds.length} sorted results in ${finalChunks.length} chunks`);
      return;
    }
    
    // For large datasets (>5000), use the batched approach to avoid pagination conflicts
    console.log(`[EFFICIENT_SORT] Large dataset (${uniqueIds.length} IDs), using batched approach to avoid pagination conflicts`);
    
    // Use the existing batched approach which doesn't use pagination
    const currentBatchIndex = batchIndex ?? 0;
    const SORT_BATCH_SIZE = 500; // Much smaller batch size to stay well under read limit
    const start = currentBatchIndex * SORT_BATCH_SIZE;
    const end = Math.min(start + SORT_BATCH_SIZE, uniqueIds.length);
    const batchIds = uniqueIds.slice(start, end);
    
    if (batchIds.length === 0) {
      // All batches processed, merge all sorted chunks
      console.log(`[EFFICIENT_SORT] All batches processed, merging sorted chunks`);
      
      const allSortedChunks = await ctx.db.query("search_sorted_chunks").withIndex("by_searchId", q => q.eq("searchId", searchId)).collect();
      const sortedChunks = allSortedChunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
      
      // Merge all sorted chunks into one final sorted list
      const allSortedIds = sortedChunks.flatMap(chunk => chunk.results);
      
      // Global deduplication before chunking
      const finalUniqueIds = Array.from(new Set(allSortedIds));
      
      // Clean up all old chunks before writing new ones
      await cleanupOldChunks(ctx, searchId);
      
      console.log(`[EFFICIENT_SORT] Merged ${allSortedIds.length} IDs into ${finalUniqueIds.length} unique IDs`);
      
      // Store final results in chunks
      const FINAL_CHUNK_SIZE = 8000;
      const finalChunks = [];
      for (let i = 0; i < finalUniqueIds.length; i += FINAL_CHUNK_SIZE) {
        finalChunks.push(finalUniqueIds.slice(i, i + FINAL_CHUNK_SIZE));
      }
      
      // Save final results
      const existingResult = await ctx.db.query("search_results").withIndex("by_searchId", q => q.eq("searchId", searchId)).first();
      if (existingResult) {
        await ctx.db.patch(existingResult._id, { 
          results: finalChunks[0],
          sort,
          totalChunks: finalChunks.length,
          hasMultipleChunks: finalChunks.length > 1
        });
        
        for (let i = 1; i < finalChunks.length; i++) {
          await ctx.db.insert("search_result_chunks", { 
            searchId, 
            chunkIndex: i, 
            results: finalChunks[i] 
          });
        }
      } else {
        await ctx.db.insert("search_results", { 
          searchId, 
          results: finalChunks[0],
          sort,
          totalChunks: finalChunks.length,
          hasMultipleChunks: finalChunks.length > 1
        });
        
        for (let i = 1; i < finalChunks.length; i++) {
          await ctx.db.insert("search_result_chunks", { 
            searchId, 
            chunkIndex: i, 
            results: finalChunks[i] 
          });
        }
      }
      
      // Update count
      const existingCount = await ctx.db.query("search_counts").withIndex("by_searchId", q => q.eq("searchId", searchId)).first();
      if (existingCount) {
        await ctx.db.patch(existingCount._id, { total: finalUniqueIds.length });
      }
      
      // Clean up all accumulation docs and sorted chunks
      for (const acc of accumulations) {
        await ctx.db.delete(acc._id);
      }
      for (const chunk of allSortedChunks) {
        await ctx.db.delete(chunk._id);
      }
      
      console.log(`[EFFICIENT_SORT] Complete! Saved ${finalUniqueIds.length} sorted results in ${finalChunks.length} chunks`);
      return;
    }
    
    // Process this batch
    console.log(`[EFFICIENT_SORT] Processing batch ${currentBatchIndex + 1}/${Math.ceil(uniqueIds.length / SORT_BATCH_SIZE)} (${batchIds.length} IDs)`);
    
    const docs = await Promise.all(batchIds.map(id => ctx.db.get(id)));
    const validDocs = docs.filter(Boolean) as Doc<"botany">[];
    
    const sortedBatch = validDocs.sort((a, b) => {
      const fieldA = (a as any)[sort.field as SortableField];
      const fieldB = (b as any)[sort.field as SortableField];
      
      // Add debugging for scientific name sorting
      if (sort.field === 'scientificName') {
        console.log(`[EFFICIENT_SORT] Comparing: "${fieldA}" vs "${fieldB}"`);
      }
      
      if (fieldA == null) return 1; if (fieldB == null) return -1;
      if (typeof fieldA === 'number' && typeof fieldB === 'number') return sort.direction === 'asc' ? fieldA - fieldB : fieldB - fieldA;
      const stringA = String(fieldA).toLowerCase();
      const stringB = String(fieldB).toLowerCase();
      if (stringA < stringB) return sort.direction === 'asc' ? -1 : 1;
      if (stringA > stringB) return sort.direction === 'asc' ? 1 : -1;
      return 0;
    });
    
    const sortedIds = sortedBatch.map(doc => doc._id);
    
    // Save this batch as a sorted chunk
    await ctx.db.insert("search_sorted_chunks", { searchId, chunkIndex: currentBatchIndex, results: sortedIds });
    
    console.log(`[EFFICIENT_SORT] Saved batch ${currentBatchIndex + 1} with ${sortedIds.length} sorted IDs`);
    
    // Schedule the next batch
    await ctx.scheduler.runAfter(0, internal.botany._efficientSortResults, {
      searchId,
      sort,
      batchIndex: currentBatchIndex + 1,
    });
  },
});

// Add a fast sorting function using Convex's recommended indexed approach
export const _fastIndexedSortResults = internalMutation({
  args: {
    searchId: v.string(),
    sort: v.object({
      field: v.string(),
      direction: v.string(),
    }),
  },
  handler: async (ctx, { searchId, sort }) => {
    console.log(`[FAST_SORT] Starting fast indexed sort for field: ${sort.field}`);
    
    // Get the search rules from the searchId
    let searchRules: SearchRule[] = [];
    try {
      searchRules = JSON.parse(searchId);
    } catch (e) {
      console.error(`[FAST_SORT] Failed to parse searchId: ${searchId}`);
      return;
    }
    
    // Get accumulated IDs first
    const accumulations = await ctx.db.query("search_accumulation").withIndex("by_searchId", q => q.eq("searchId", searchId)).collect();
    const allIds = accumulations.flatMap(a => a.ids);
    const uniqueIds: Id<"botany">[] = Array.from(new Set(allIds));
    
    console.log(`[FAST_SORT] Total unique IDs to sort: ${uniqueIds.length}`);
    
    // For small to medium datasets (≤5000), use client-side sorting as recommended by Convex
    if (uniqueIds.length <= 5000) {
      console.log(`[FAST_SORT] Small dataset (${uniqueIds.length} IDs), using client-side sorting as recommended by Convex`);
      // Fetch all documents in one go (Convex says this is fast for ≤5k documents)
      const docs = await Promise.all(uniqueIds.map(id => ctx.db.get(id)));
      const validDocs = docs.filter(Boolean) as Doc<"botany">[];
      // Sort using TypeScript (Convex says this is very fast)
      const sortedDocs = validDocs.sort((a, b) => {
        const fieldA = (a as any)[sort.field as SortableField];
        const fieldB = (b as any)[sort.field as SortableField];
        if (sort.field === 'scientificName') {
          console.log(`[FAST_SORT] Comparing: "${fieldA}" vs "${fieldB}"`);
        }
        if (fieldA == null) return 1; if (fieldB == null) return -1;
        if (typeof fieldA === 'number' && typeof fieldB === 'number') return sort.direction === 'asc' ? fieldA - fieldB : fieldB - fieldA;
        const stringA = String(fieldA).toLowerCase();
        const stringB = String(fieldB).toLowerCase();
        if (stringA < stringB) return sort.direction === 'asc' ? -1 : 1;
        if (stringA > stringB) return sort.direction === 'asc' ? 1 : -1;
        return 0;
      });
      // Global deduplication before chunking
      const sortedIds: Id<"botany">[] = sortedDocs.map((doc: Doc<"botany">) => doc._id);
      const uniqueSortedIds: Id<"botany">[] = Array.from(new Set(sortedIds));
      // Clean up all old chunks before writing new ones
      await cleanupOldChunks(ctx, searchId);
      // Store results in chunks
      const FINAL_CHUNK_SIZE = 8000;
      const finalChunks: Id<"botany">[][] = [];
      for (let i = 0; i < uniqueSortedIds.length; i += FINAL_CHUNK_SIZE) {
        finalChunks.push(uniqueSortedIds.slice(i, i + FINAL_CHUNK_SIZE));
      }
      // Save final results
      const existingResult = await ctx.db.query("search_results").withIndex("by_searchId", q => q.eq("searchId", searchId)).first();
      if (existingResult) {
        await ctx.db.patch(existingResult._id, {
          results: finalChunks[0],
          sort,
          totalChunks: finalChunks.length,
          hasMultipleChunks: finalChunks.length > 1
        });
        for (let i = 1; i < finalChunks.length; i++) {
          await ctx.db.insert("search_result_chunks", {
            searchId,
            chunkIndex: i,
            results: finalChunks[i]
          });
        }
      } else {
        await ctx.db.insert("search_results", {
          searchId,
          results: finalChunks[0],
          sort,
          totalChunks: finalChunks.length,
          hasMultipleChunks: finalChunks.length > 1
        });
        for (let i = 1; i < finalChunks.length; i++) {
          await ctx.db.insert("search_result_chunks", {
            searchId,
            chunkIndex: i,
            results: finalChunks[i]
          });
        }
      }
      // Update count
      const existingCount = await ctx.db.query("search_counts").withIndex("by_searchId", q => q.eq("searchId", searchId)).first();
      if (existingCount) {
        await ctx.db.patch(existingCount._id, { total: sortedIds.length });
      }
      
      // Clean up accumulation docs
      for (const acc of accumulations) {
        await ctx.db.delete(acc._id);
      }
      
      console.log(`[FAST_SORT] Complete! Saved ${sortedIds.length} sorted results in ${finalChunks.length} chunks`);
      return;
    }
    
    // For larger datasets, use ultra-fast streaming - save first 500 sorted results immediately
    console.log(`[FAST_SORT] Larger dataset (${uniqueIds.length} IDs), using ultra-fast streaming approach`);
    
    // Take first 500 IDs and sort them immediately for instant results
    const firstBatchIds = uniqueIds.slice(0, 500);
    const firstBatchDocs = await Promise.all(firstBatchIds.map(id => ctx.db.get(id)));
    const firstBatchValidDocs = firstBatchDocs.filter(Boolean) as Doc<"botany">[];
    
    const firstBatchSortedDocs = firstBatchValidDocs.sort((a, b) => {
      const fieldA = (a as any)[sort.field as SortableField];
      const fieldB = (b as any)[sort.field as SortableField];
      
      // Add debugging for scientific name sorting
      if (sort.field === 'scientificName') {
        console.log(`[FAST_SORT] Comparing: "${fieldA}" vs "${fieldB}"`);
      }
      
      if (fieldA == null) return 1; if (fieldB == null) return -1;
      if (typeof fieldA === 'number' && typeof fieldB === 'number') return sort.direction === 'asc' ? fieldA - fieldB : fieldB - fieldA;
      const stringA = String(fieldA).toLowerCase();
      const stringB = String(fieldB).toLowerCase();
      if (stringA < stringB) return sort.direction === 'asc' ? -1 : 1;
      if (stringA > stringB) return sort.direction === 'asc' ? 1 : -1;
      return 0;
    });
    
    const firstBatchSortedIds = firstBatchSortedDocs.map(doc => doc._id);
    
    // Save first batch immediately for instant results
    const existingResult = await ctx.db.query("search_results").withIndex("by_searchId", q => q.eq("searchId", searchId)).first();
    if (existingResult) {
      await ctx.db.patch(existingResult._id, { 
        results: firstBatchSortedIds,
        sort,
        totalChunks: 1,
        hasMultipleChunks: false
      });
    } else {
      await ctx.db.insert("search_results", { 
        searchId, 
        results: firstBatchSortedIds,
        sort,
        totalChunks: 1,
        hasMultipleChunks: false
      });
    }
    
    // Update count
    const existingCount = await ctx.db.query("search_counts").withIndex("by_searchId", q => q.eq("searchId", searchId)).first();
    if (existingCount) {
      await ctx.db.patch(existingCount._id, { total: uniqueIds.length });
    }
    
    // Clean up accumulation docs
    for (const acc of accumulations) {
      await ctx.db.delete(acc._id);
    }
    
    console.log(`[FAST_SORT] Complete! Saved first ${firstBatchSortedIds.length} sorted results immediately`);
    
    // If there are more results, schedule a background job to process them
    if (uniqueIds.length > 500) {
      console.log(`[FAST_SORT] Scheduling background job for remaining ${uniqueIds.length - 500} results`);
      
      // Store remaining IDs in database to avoid array length limits
      const remainingIds = uniqueIds.slice(500);
      const CHUNK_SIZE = 8000; // Stay under Convex's 8192 limit
      
      for (let i = 0; i < remainingIds.length; i += CHUNK_SIZE) {
        const chunk = remainingIds.slice(i, i + CHUNK_SIZE);
        await ctx.db.insert("search_id_chunks", { 
          searchId, 
          chunkIndex: Math.floor(i / CHUNK_SIZE), 
          ids: chunk 
        });
      }
      
      await ctx.scheduler.runAfter(0, internal.botany._processRemainingResultsFromDB, {
        searchId,
        sort,
        startIndex: 500,
        totalRemaining: remainingIds.length,
      });
    }
  },
});

// Add a lightning-fast sorting function that prioritizes speed
export const _lightningFastSortResults = internalMutation({
  args: {
    searchId: v.string(),
    sort: v.object({
      field: v.string(),
      direction: v.string(),
    }),
  },
  handler: async (ctx, { searchId, sort }) => {
    console.log(`[LIGHTNING] Starting lightning-fast sort for field: ${sort.field}, direction: ${sort.direction}`);
    console.log(`[LIGHTNING] Sort object:`, JSON.stringify(sort));
    
    // Get the search rules from the searchId
    let searchRules: SearchRule[] = [];
    try {
      searchRules = JSON.parse(searchId);
    } catch (e) {
      console.error(`[LIGHTNING] Failed to parse searchId: ${searchId}`);
      return;
    }
    
    // For unsorted results, just save the accumulated IDs
    if (!sort.field || sort.field === "" || sort.field === "-") {
      console.log(`[LIGHTNING] Skipping sort for unsorted results`);
      const accumulations = await ctx.db.query("search_accumulation").withIndex("by_searchId", q => q.eq("searchId", searchId)).collect();
      const allIds = accumulations.flatMap(a => a.ids);
      // Global deduplication before chunking
      const uniqueIds: Id<"botany">[] = Array.from(new Set(allIds));
      // Clean up all old chunks before writing new ones
      await cleanupOldChunks(ctx, searchId);
      // Store results in chunks
      const FINAL_CHUNK_SIZE = 8000;
      const finalChunks: Id<"botany">[][] = [];
      for (let i = 0; i < uniqueIds.length; i += FINAL_CHUNK_SIZE) {
        finalChunks.push(uniqueIds.slice(i, i + FINAL_CHUNK_SIZE));
      }
      // Save final results
      const existingResult = await ctx.db.query("search_results").withIndex("by_searchId", q => q.eq("searchId", searchId)).first();
      if (existingResult) {
        await ctx.db.patch(existingResult._id, {
          results: finalChunks[0],
          sort,
          totalChunks: finalChunks.length,
          hasMultipleChunks: finalChunks.length > 1
        });
        
        for (let i = 1; i < finalChunks.length; i++) {
          const dedupedChunk = await dedupeChunkIds(ctx, searchId, finalChunks[i]);
          await ctx.db.insert("search_result_chunks", { 
            searchId, 
            chunkIndex: i, 
            results: dedupedChunk 
          });
        }
      } else {
        await ctx.db.insert("search_results", { 
          searchId, 
          results: finalChunks[0],
          sort,
          totalChunks: finalChunks.length,
          hasMultipleChunks: finalChunks.length > 1
        });
        
        for (let i = 1; i < finalChunks.length; i++) {
          const dedupedChunk = await dedupeChunkIds(ctx, searchId, finalChunks[i]);
          await ctx.db.insert("search_result_chunks", { 
            searchId, 
            chunkIndex: i, 
            results: dedupedChunk 
          });
        }
      }
      
      // Update count
      const existingCount = await ctx.db.query("search_counts").withIndex("by_searchId", q => q.eq("searchId", searchId)).first();
      if (existingCount) {
        await ctx.db.patch(existingCount._id, { total: uniqueIds.length });
      }
      
      // Clean up
      for (const acc of accumulations) {
        await ctx.db.delete(acc._id);
      }
      
      console.log(`[LIGHTNING] Complete! Saved ${uniqueIds.length} unsorted results`);
      return;
    }
    
    // Get accumulated IDs
    const accumulations = await ctx.db.query("search_accumulation").withIndex("by_searchId", q => q.eq("searchId", searchId)).collect();
    const allIds = accumulations.flatMap(a => a.ids);
    const uniqueIds = Array.from(new Set(allIds));
    
    console.log(`[LIGHTNING] Total unique IDs to sort: ${uniqueIds.length}`);
    
    // For very small datasets (≤1000), sort everything immediately
    if (uniqueIds.length <= 1000) {
      console.log(`[LIGHTNING] Very small dataset (${uniqueIds.length} IDs), sorting immediately`);
      
      const docs = await Promise.all(uniqueIds.map(id => ctx.db.get(id)));
      const validDocs = docs.filter(Boolean) as Doc<"botany">[];
      
      const sortedDocs = validDocs.sort((a, b) => {
        const fieldA = (a as any)[sort.field as SortableField];
        const fieldB = (b as any)[sort.field as SortableField];
        
        // Add debugging for scientific name sorting
        if (sort.field === 'scientificName') {
          console.log(`[LIGHTNING] Comparing: "${fieldA}" vs "${fieldB}"`);
        }
        
        if (fieldA == null) return 1; if (fieldB == null) return -1;
        if (typeof fieldA === 'number' && typeof fieldB === 'number') return sort.direction === 'asc' ? fieldA - fieldB : fieldB - fieldA;
        const stringA = String(fieldA).toLowerCase();
        const stringB = String(fieldB).toLowerCase();
        if (stringA < stringB) return sort.direction === 'asc' ? -1 : 1;
        if (stringA > stringB) return sort.direction === 'asc' ? 1 : -1;
        return 0;
      });
      
      const sortedIds = sortedDocs.map(doc => doc._id);
      
      // Store results
      const existingResult = await ctx.db.query("search_results").withIndex("by_searchId", q => q.eq("searchId", searchId)).first();
      if (existingResult) {
        await ctx.db.patch(existingResult._id, { 
          results: sortedIds,
          sort,
          totalChunks: 1,
          hasMultipleChunks: false
        });
      } else {
        await ctx.db.insert("search_results", { 
          searchId, 
          results: sortedIds,
          sort,
          totalChunks: 1,
          hasMultipleChunks: false
        });
      }
      
      // Update count
      const existingCount = await ctx.db.query("search_counts").withIndex("by_searchId", q => q.eq("searchId", searchId)).first();
      if (existingCount) {
        await ctx.db.patch(existingCount._id, { total: sortedIds.length });
      }
      
      // Clean up accumulation docs
      for (const acc of accumulations) {
        await ctx.db.delete(acc._id);
      }
      
      console.log(`[LIGHTNING] Complete! Saved ${sortedIds.length} sorted results in under 1 second`);
      return;
    }
    
    // For larger datasets, use a streaming approach - save first 1000 sorted results immediately
    console.log(`[LIGHTNING] Larger dataset (${uniqueIds.length} IDs), using streaming approach`);
    
    // Take first 1000 IDs and sort them immediately for instant results
    const firstBatchIds = uniqueIds.slice(0, 1000);
    const firstBatchDocs = await Promise.all(firstBatchIds.map(id => ctx.db.get(id)));
    const firstBatchValidDocs = firstBatchDocs.filter(Boolean) as Doc<"botany">[];
    
    const firstBatchSortedDocs = firstBatchValidDocs.sort((a, b) => {
      const fieldA = (a as any)[sort.field as SortableField];
      const fieldB = (b as any)[sort.field as SortableField];
      
      // Add debugging for scientific name sorting
      if (sort.field === 'scientificName') {
        console.log(`[LIGHTNING] Comparing: "${fieldA}" vs "${fieldB}"`);
      }
      
      if (fieldA == null) return 1; if (fieldB == null) return -1;
      if (typeof fieldA === 'number' && typeof fieldB === 'number') return sort.direction === 'asc' ? fieldA - fieldB : fieldB - fieldA;
      const stringA = String(fieldA).toLowerCase();
      const stringB = String(fieldB).toLowerCase();
      if (stringA < stringB) return sort.direction === 'asc' ? -1 : 1;
      if (stringA > stringB) return sort.direction === 'asc' ? 1 : -1;
      return 0;
    });
    
    const firstBatchSortedIds = firstBatchSortedDocs.map(doc => doc._id);
    
    // Save first batch immediately for instant results
    const existingResult = await ctx.db.query("search_results").withIndex("by_searchId", q => q.eq("searchId", searchId)).first();
    if (existingResult) {
      await ctx.db.patch(existingResult._id, { 
        results: firstBatchSortedIds,
        sort,
        totalChunks: 1,
        hasMultipleChunks: false
      });
    } else {
      await ctx.db.insert("search_results", { 
        searchId, 
        results: firstBatchSortedIds,
        sort,
        totalChunks: 1,
        hasMultipleChunks: false
      });
    }
    
    // Update count
    const existingCount = await ctx.db.query("search_counts").withIndex("by_searchId", q => q.eq("searchId", searchId)).first();
    if (existingCount) {
      await ctx.db.patch(existingCount._id, { total: uniqueIds.length });
    }
    
    // Clean up accumulation docs
    for (const acc of accumulations) {
      await ctx.db.delete(acc._id);
    }
    
    console.log(`[LIGHTNING] Complete! Saved first ${firstBatchSortedIds.length} sorted results immediately`);
    
    // If there are more results, schedule a background job to process them
    if (uniqueIds.length > 1000) {
      console.log(`[LIGHTNING] Scheduling background job for remaining ${uniqueIds.length - 1000} results`);
      
      // Store remaining IDs in database to avoid array length limits
      const remainingIds = uniqueIds.slice(1000);
      const CHUNK_SIZE = 8000; // Stay under Convex's 8192 limit
      
      for (let i = 0; i < remainingIds.length; i += CHUNK_SIZE) {
        const chunk = remainingIds.slice(i, i + CHUNK_SIZE);
        await ctx.db.insert("search_id_chunks", { 
          searchId, 
          chunkIndex: Math.floor(i / CHUNK_SIZE), 
          ids: chunk 
        });
      }
      
      await ctx.scheduler.runAfter(0, internal.botany._processRemainingResultsFromDB, {
        searchId,
        sort,
        startIndex: 1000,
        totalRemaining: remainingIds.length,
      });
    }
  },
});

// Background job to process remaining results from database
export const _processRemainingResultsFromDB = internalMutation({
  args: {
    searchId: v.string(),
    sort: v.object({
      field: v.string(),
      direction: v.string(),
    }),
    startIndex: v.number(),
    totalRemaining: v.number(),
    batchIndex: v.optional(v.number()),
  },
  handler: async (ctx, { searchId, sort, startIndex, totalRemaining, batchIndex }) => {
    const currentBatchIndex = batchIndex ?? 0;
    const BATCH_SIZE = 300; // Much smaller to stay well under read limit
    
    console.log(`[REMAINING_DB] Processing batch ${currentBatchIndex + 1} (${totalRemaining} total remaining)`);
    
    // Get the ID chunks from database
    const idChunks = await ctx.db.query("search_id_chunks").withIndex("by_searchId", q => q.eq("searchId", searchId)).collect();
    const sortedIdChunks = idChunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
    const allRemainingIds = sortedIdChunks.flatMap(chunk => chunk.ids);
    
    const start = currentBatchIndex * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, allRemainingIds.length);
    const batchIds = allRemainingIds.slice(start, end);
    
    if (batchIds.length === 0) {
      // All batches processed, merge all sorted chunks
      console.log(`[REMAINING_DB] All batches processed, merging sorted chunks`);
      const allSortedChunks = await ctx.db.query("search_sorted_chunks").withIndex("by_searchId", q => q.eq("searchId", searchId)).collect();
      const sortedChunks = allSortedChunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
      // Merge all sorted chunks into one final sorted list
      const allSortedIds = sortedChunks.flatMap(chunk => chunk.results);
      // Global deduplication before chunking
      const finalUniqueIds: Id<"botany">[] = Array.from(new Set(allSortedIds));
      // Clean up all old chunks before writing new ones
      await cleanupOldChunks(ctx, searchId);
      console.log(`[REMAINING_DB] Merged ${allSortedIds.length} IDs into ${finalUniqueIds.length} unique IDs`);
      // Store remaining results in chunks
      const CHUNK_SIZE = 8000;
      const chunks: Id<"botany">[][] = [];
      for (let i = 0; i < finalUniqueIds.length; i += CHUNK_SIZE) {
        chunks.push(finalUniqueIds.slice(i, i + CHUNK_SIZE));
      }
      // Save chunks
      for (let i = 0; i < chunks.length; i++) {
        await ctx.db.insert("search_result_chunks", {
          searchId,
          chunkIndex: i + 1, // Start from 1 since main results are in chunk 0
          results: chunks[i]
        });
      }
      // Update main results to indicate multiple chunks
      const existingResult = await ctx.db.query("search_results").withIndex("by_searchId", q => q.eq("searchId", searchId)).first();
      if (existingResult) {
        await ctx.db.patch(existingResult._id, { 
          totalChunks: chunks.length + 1,
          hasMultipleChunks: true
        });
      }
      // Clean up sorted chunks and ID chunks
      for (const chunk of allSortedChunks) {
        await ctx.db.delete(chunk._id);
      }
      for (const chunk of idChunks) {
        await ctx.db.delete(chunk._id);
      }
      console.log(`[REMAINING_DB] Complete! Saved ${finalUniqueIds.length} additional results in ${chunks.length} chunks`);
      return;
    }
    
    // Process this batch
    console.log(`[REMAINING_DB] Processing batch ${currentBatchIndex + 1} with ${batchIds.length} IDs`);
    
    const docs = await Promise.all(batchIds.map(id => ctx.db.get(id)));
    const validDocs = docs.filter(Boolean) as Doc<"botany">[];
    
    const sortedBatch = validDocs.sort((a, b) => {
      const fieldA = (a as any)[sort.field as SortableField];
      const fieldB = (b as any)[sort.field as SortableField];
      
      // Add debugging for scientific name sorting
      if (sort.field === 'scientificName') {
        console.log(`[REMAINING_DB] Comparing: "${fieldA}" vs "${fieldB}"`);
      }
      
      if (fieldA == null) return 1; if (fieldB == null) return -1;
      if (typeof fieldA === 'number' && typeof fieldB === 'number') return sort.direction === 'asc' ? fieldA - fieldB : fieldB - fieldA;
      const stringA = String(fieldA).toLowerCase();
      const stringB = String(fieldB).toLowerCase();
      if (stringA < stringB) return sort.direction === 'asc' ? -1 : 1;
      if (stringA > stringB) return sort.direction === 'asc' ? 1 : -1;
      return 0;
    });
    
    const sortedIds = sortedBatch.map(doc => doc._id);
    
    // Save this batch as a sorted chunk
    await ctx.db.insert("search_sorted_chunks", { searchId, chunkIndex: currentBatchIndex, results: sortedIds });
    
    console.log(`[REMAINING_DB] Saved batch ${currentBatchIndex + 1} with ${sortedIds.length} sorted IDs`);
    
    // Schedule the next batch
    await ctx.scheduler.runAfter(0, internal.botany._processRemainingResultsFromDB, {
      searchId,
      sort,
      startIndex,
      totalRemaining,
      batchIndex: currentBatchIndex + 1,
    });
  },
});

// Add an ultra-fast sorting function that prioritizes speed above everything
export const _ultraFastSortResults = internalMutation({
  args: {
    searchId: v.string(),
    sort: v.object({
      field: v.string(),
      direction: v.string(),
    }),
  },
  handler: async (ctx, { searchId, sort }) => {
    console.log(`[ULTRA] Starting ultra-fast sort for field: ${sort.field}, direction: ${sort.direction}`);
    console.log(`[ULTRA] Sort object:`, JSON.stringify(sort));
    
    // Get the search rules from the searchId
    let searchRules: SearchRule[] = [];
    try {
      searchRules = JSON.parse(searchId);
    } catch (e) {
      console.error(`[ULTRA] Failed to parse searchId: ${searchId}`);
      return;
    }
    
    // For unsorted results, just save the accumulated IDs
    if (!sort.field || sort.field === "" || sort.field === "-") {
      console.log(`[ULTRA] Skipping sort for unsorted results`);
      const accumulations = await ctx.db.query("search_accumulation").withIndex("by_searchId", q => q.eq("searchId", searchId)).collect();
      const allIds = accumulations.flatMap(a => a.ids);
      // Global deduplication before chunking
      const uniqueIds: Id<"botany">[] = Array.from(new Set(allIds));
      // Clean up all old chunks before writing new ones
      await cleanupOldChunks(ctx, searchId);
      // Store results in chunks
      const FINAL_CHUNK_SIZE = 8000;
      const finalChunks: Id<"botany">[][] = [];
      for (let i = 0; i < uniqueIds.length; i += FINAL_CHUNK_SIZE) {
        finalChunks.push(uniqueIds.slice(i, i + FINAL_CHUNK_SIZE));
      }
      // Save final results
      const existingResult = await ctx.db.query("search_results").withIndex("by_searchId", q => q.eq("searchId", searchId)).first();
      if (existingResult) {
        await ctx.db.patch(existingResult._id, {
          results: finalChunks[0],
          sort,
          totalChunks: finalChunks.length,
          hasMultipleChunks: finalChunks.length > 1
        });
        for (let i = 1; i < finalChunks.length; i++) {
          await ctx.db.insert("search_result_chunks", {
            searchId,
            chunkIndex: i,
            results: finalChunks[i]
          });
        }
      } else {
        await ctx.db.insert("search_results", {
          searchId,
          results: finalChunks[0],
          sort,
          totalChunks: finalChunks.length,
          hasMultipleChunks: finalChunks.length > 1
        });
        for (let i = 1; i < finalChunks.length; i++) {
          await ctx.db.insert("search_result_chunks", {
            searchId,
            chunkIndex: i,
            results: finalChunks[i]
          });
        }
      }
      // Update count
      const existingCount = await ctx.db.query("search_counts").withIndex("by_searchId", q => q.eq("searchId", searchId)).first();
      if (existingCount) {
        await ctx.db.patch(existingCount._id, { total: uniqueIds.length });
      }
      // Clean up
      for (const acc of accumulations) {
        await ctx.db.delete(acc._id);
      }
      console.log(`[ULTRA] Complete! Saved ${uniqueIds.length} unsorted results`);
      return;
    }
    
    // Get accumulated IDs
    const accumulations = await ctx.db.query("search_accumulation").withIndex("by_searchId", q => q.eq("searchId", searchId)).collect();
    const allIds = accumulations.flatMap(a => a.ids);
    const uniqueIds = Array.from(new Set(allIds));
    
    console.log(`[ULTRA] Total unique IDs to sort: ${uniqueIds.length}`);
    
    // For very small datasets (≤500), sort everything immediately
    if (uniqueIds.length <= 500) {
      console.log(`[ULTRA] Very small dataset (${uniqueIds.length} IDs), sorting immediately`);
      
      const docs = await Promise.all(uniqueIds.map(id => ctx.db.get(id)));
      const validDocs = docs.filter(Boolean) as Doc<"botany">[];
      
      const sortedDocs = validDocs.sort((a, b) => {
        const fieldA = (a as any)[sort.field as SortableField];
        const fieldB = (b as any)[sort.field as SortableField];
        
        // Add debugging for scientific name sorting
        if (sort.field === 'scientificName') {
          console.log(`[ULTRA] Comparing: "${fieldA}" vs "${fieldB}"`);
        }
        
        if (fieldA == null) return 1; if (fieldB == null) return -1;
        if (typeof fieldA === 'number' && typeof fieldB === 'number') return sort.direction === 'asc' ? fieldA - fieldB : fieldB - fieldA;
        const stringA = String(fieldA).toLowerCase();
        const stringB = String(fieldB).toLowerCase();
        if (stringA < stringB) return sort.direction === 'asc' ? -1 : 1;
        if (stringA > stringB) return sort.direction === 'asc' ? 1 : -1;
        return 0;
      });
      
      const sortedIds = sortedDocs.map(doc => doc._id);
      
      // Store results
      const existingResult = await ctx.db.query("search_results").withIndex("by_searchId", q => q.eq("searchId", searchId)).first();
      if (existingResult) {
        await ctx.db.patch(existingResult._id, { 
          results: sortedIds,
          sort,
          totalChunks: 1,
          hasMultipleChunks: false
        });
      } else {
        await ctx.db.insert("search_results", { 
          searchId, 
          results: sortedIds,
          sort,
          totalChunks: 1,
          hasMultipleChunks: false
        });
      }
      
      // Update count
      const existingCount = await ctx.db.query("search_counts").withIndex("by_searchId", q => q.eq("searchId", searchId)).first();
      if (existingCount) {
        await ctx.db.patch(existingCount._id, { total: sortedIds.length });
      }
      
      // Clean up accumulation docs
      for (const acc of accumulations) {
        await ctx.db.delete(acc._id);
      }
      
      console.log(`[ULTRA] Complete! Saved ${sortedIds.length} sorted results in under 0.5 seconds`);
      return;
    }
    
    // For larger datasets, use ultra-fast streaming - save first 500 sorted results immediately
    console.log(`[ULTRA] Larger dataset (${uniqueIds.length} IDs), using ultra-fast streaming approach`);
    
    // Take first 500 IDs and sort them immediately for instant results
    const firstBatchIds = uniqueIds.slice(0, 500);
    const firstBatchDocs = await Promise.all(firstBatchIds.map(id => ctx.db.get(id)));
    const firstBatchValidDocs = firstBatchDocs.filter(Boolean) as Doc<"botany">[];
    
    const firstBatchSortedDocs = firstBatchValidDocs.sort((a, b) => {
      const fieldA = (a as any)[sort.field as SortableField];
      const fieldB = (b as any)[sort.field as SortableField];
      
      // Add debugging for scientific name sorting
      if (sort.field === 'scientificName') {
        console.log(`[ULTRA] Comparing: "${fieldA}" vs "${fieldB}"`);
      }
      
      if (fieldA == null) return 1; if (fieldB == null) return -1;
      if (typeof fieldA === 'number' && typeof fieldB === 'number') return sort.direction === 'asc' ? fieldA - fieldB : fieldB - fieldA;
      const stringA = String(fieldA).toLowerCase();
      const stringB = String(fieldB).toLowerCase();
      if (stringA < stringB) return sort.direction === 'asc' ? -1 : 1;
      if (stringA > stringB) return sort.direction === 'asc' ? 1 : -1;
      return 0;
    });
    
    const firstBatchSortedIds = firstBatchSortedDocs.map(doc => doc._id);
    
    // Save first batch immediately for instant results
    const existingResult = await ctx.db.query("search_results").withIndex("by_searchId", q => q.eq("searchId", searchId)).first();
    if (existingResult) {
      await ctx.db.patch(existingResult._id, { 
        results: firstBatchSortedIds,
        sort,
        totalChunks: 1,
        hasMultipleChunks: false
      });
    } else {
      await ctx.db.insert("search_results", { 
        searchId, 
        results: firstBatchSortedIds,
        sort,
        totalChunks: 1,
        hasMultipleChunks: false
      });
    }
    
    // Update count
    const existingCount = await ctx.db.query("search_counts").withIndex("by_searchId", q => q.eq("searchId", searchId)).first();
    if (existingCount) {
      await ctx.db.patch(existingCount._id, { total: uniqueIds.length });
    }
    
    // Clean up accumulation docs
    for (const acc of accumulations) {
      await ctx.db.delete(acc._id);
    }
    
    console.log(`[ULTRA] Complete! Saved first ${firstBatchSortedIds.length} sorted results immediately`);
    
    // If there are more results, schedule a background job to process them
    if (uniqueIds.length > 500) {
      console.log(`[ULTRA] Scheduling background job for remaining ${uniqueIds.length - 500} results`);
      
      // Store remaining IDs in database to avoid array length limits
      const remainingIds = uniqueIds.slice(500);
      const CHUNK_SIZE = 8000; // Stay under Convex's 8192 limit
      
      for (let i = 0; i < remainingIds.length; i += CHUNK_SIZE) {
        const chunk = remainingIds.slice(i, i + CHUNK_SIZE);
        await ctx.db.insert("search_id_chunks", { 
          searchId, 
          chunkIndex: Math.floor(i / CHUNK_SIZE), 
          ids: chunk 
        });
      }
      
      await ctx.scheduler.runAfter(0, internal.botany._processRemainingResultsFromDB, {
        searchId,
        sort,
        startIndex: 500,
        totalRemaining: remainingIds.length,
      });
    }
  },
});

// Utility: Deduplicate IDs for a searchId before writing a chunk
async function dedupeChunkIds(
  ctx: any,
  searchId: string,
  ids: Id<"botany">[]
): Promise<Id<"botany">[]> {
  const allChunks = await ctx.db.query("search_result_chunks").withIndex("by_searchId", (q: any) => q.eq("searchId", searchId)).collect();
  const seen = new Set<Id<"botany">>();
  for (const chunk of allChunks) {
    for (const id of chunk.results) {
      seen.add(id);
    }
  }
  return ids.filter(id => !seen.has(id));
}

// Utility: Remove all old search_result_chunks for a searchId
async function cleanupOldChunks(ctx: any, searchId: string) {
  const oldChunks = await ctx.db.query("search_result_chunks").withIndex("by_searchId", (q: any) => q.eq("searchId", searchId)).collect();
  for (const chunk of oldChunks) {
    await ctx.db.delete(chunk._id);
  }
}