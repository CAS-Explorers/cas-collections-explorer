import { getCountryFromCode } from "../utils/countryUtils";
import { query } from "./_generated/server";
import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";
import { Plant } from "./schema";
import { paginationOptsValidator } from "convex/server";
import { mutation } from "./_generated/server";

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

export const searchPlants = query({
  args: {
    rules: v.array(
      v.object({
        field: v.string(),
        operator: v.string(),
        value: v.optional(v.union(v.string(), v.number())),
        secondValue: v.optional(v.union(v.string(), v.number())),
      })
    ),
    sort: v.object({
      field: v.string(),
      direction: v.string(), // 'asc' or 'desc'
    }),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const { rules, sort, paginationOpts } = args;

    // Get valid search rules (non-empty values)
    const validRules = rules.filter(rule => {
      if (rule.value === undefined || rule.value === null) return false;
      if (rule.operator === "between" && (rule.secondValue === undefined || rule.secondValue === null)) return false;
      return String(rule.value).trim() !== "";
    });

    let queryBuilder;

    if (validRules.length === 0) {
      // If there are no rules, we can't sort using a text search index.
      // We will fetch all and sort in memory.
      // This is inefficient for large datasets but required without a dedicated sort index.
      queryBuilder = ctx.db.query("botany");

    } else {
      const firstRule = validRules[0];

      if (["longitude1", "latitude1", "barCode", "accessionNumber", "minElevation", "maxElevation", "startDateMonth", "startDateDay", "startDateYear", "endDateMonth", "endDateDay", "endDateYear"].includes(firstRule.field)) {
        const numValue = Number(firstRule.value);
        if (isNaN(numValue)) { return { page: [], isDone: true, continueCursor: "" }; }

        let indexName: any = `by_${firstRule.field}`;
        if (firstRule.field === 'latitude1') indexName = 'by_latitude';
        if (firstRule.field === 'longitude1') indexName = 'by_longitude';
        
        queryBuilder = ctx.db.query("botany").withIndex(indexName, (q: any) => {
          switch (firstRule.operator) {
            case "=": return q.eq(firstRule.field, numValue);
            case "after": return q.gt(firstRule.field, numValue);
            case "before": return q.lt(firstRule.field, numValue);
            case "between":
              const secondValue = Number(firstRule.secondValue);
              if (isNaN(secondValue)) return q.eq(firstRule.field, NaN);
              return q.gte(firstRule.field, numValue).lte(firstRule.field, secondValue);
            default: return q.eq(firstRule.field, NaN);
          }
        });
      } else {
        let searchValue = String(firstRule.value);
        const indexName = `search_${firstRule.field}` as SearchIndex;
        
        // Handle different text operators for the initial search
        switch (firstRule.operator) {
          case "=":
            // For exact match, we'll use search and filter the results
            queryBuilder = ctx.db.query("botany").withSearchIndex(indexName, (q) =>
              q.search(firstRule.field as SearchField, searchValue)
            );
            break;
          case "contains":
            queryBuilder = ctx.db.query("botany").withSearchIndex(indexName, (q) =>
              q.search(firstRule.field as SearchField, searchValue)
            );
            break;
          case "contains_any":
            // For contains_any, search for the first term in the list
            const terms = searchValue.split(/[,\s]+/).filter(term => term.trim() !== "");
            const firstTerm = terms[0]; // Use the first term for the search
            queryBuilder = ctx.db.query("botany").withSearchIndex(indexName, (q) =>
              q.search(firstRule.field as SearchField, firstTerm)
            );
            break;
          case "in":
            // For in, we'll search for all values and combine results
            const values = searchValue.split(/[,\s]+/).filter(v => v.trim() !== "");
            queryBuilder = ctx.db.query("botany").withSearchIndex(indexName, (q) =>
              q.search(firstRule.field as SearchField, values.join(" "))
            );
            break;
          default:
            queryBuilder = ctx.db.query("botany").withSearchIndex(indexName, (q) =>
              q.search(firstRule.field as SearchField, searchValue)
            );
        }
      }
    }

    // Use Convex pagination directly
    const paginatedResults = await queryBuilder.paginate(paginationOpts);
    
    // Apply additional filters to the paginated results
    const filteredPage = paginatedResults.page.filter(plant => {
      if (validRules.length <= 1) return true;
      for (let i = 1; i < validRules.length; i++) {
        const rule = validRules[i];
        const plantValue = (plant as any)[rule.field];

        if (typeof plantValue === 'number') {
          const numValue = Number(rule.value);
          if (isNaN(numValue)) continue;
          switch (rule.operator) {
            case "=": if (plantValue !== numValue) return false; break;
            case "after": if (plantValue <= numValue) return false; break;
            case "before": if (plantValue >= numValue) return false; break;
            case "between":
              const secondValue = Number(rule.secondValue);
              if (isNaN(secondValue) || plantValue < numValue || plantValue > secondValue) return false;
              break;
            default: return false;
          }
        } else {
          const searchTerm = String(rule.value).toLowerCase().trim();
          const fieldValue = String(plantValue).toLowerCase();
          
          switch (rule.operator) {
            case "=":
              // Exact match
              if (fieldValue !== searchTerm) return false;
              break;
            case "contains":
              // Substring match - searchTerm should be found within fieldValue
              if (!fieldValue.includes(searchTerm)) return false;
              break;
            case "contains_any":
              // Contains the first matching term from the comma-separated list
              const terms = searchTerm.split(/[,\s]+/).filter(term => term.trim() !== "");
              const firstMatch = terms.find(term => fieldValue.includes(term.trim()));
              if (!firstMatch) return false;
              break;
            case "in":
              // Matches any of the specified exact values (comma-separated)
              const values = searchTerm.split(/[,\s]+/).filter(v => v.trim() !== "");
              if (!values.some(value => fieldValue === value.trim())) return false;
              break;
            default:
              // Default to contains behavior
              if (!fieldValue.includes(searchTerm)) return false;
          }
        }
      }
      return true;
    });

    // Also apply the first rule's text operator filtering if it's a text field
    let finalFilteredPage = filteredPage;
    if (validRules.length > 0 && !["longitude1", "latitude1", "barCode", "accessionNumber", "minElevation", "maxElevation", "startDateMonth", "startDateDay", "startDateYear", "endDateMonth", "endDateDay", "endDateYear"].includes(validRules[0].field)) {
      const firstRule = validRules[0];
      const searchTerm = String(firstRule.value).toLowerCase().trim();
      
      finalFilteredPage = filteredPage.filter(plant => {
        const fieldValue = String((plant as any)[firstRule.field]).toLowerCase();
        
        switch (firstRule.operator) {
          case "=":
            return fieldValue === searchTerm;
          case "contains":
            return fieldValue.includes(searchTerm);
          case "contains_any":
            const terms = searchTerm.split(/[,\s]+/).filter(term => term.trim() !== "");
            const firstMatch = terms.find(term => fieldValue.includes(term.trim()));
            return firstMatch !== undefined;
          case "in":
            const values = searchTerm.split(/[,\s]+/).filter(v => v.trim() !== "");
            return values.some(value => fieldValue === value.trim());
          default:
            return fieldValue.includes(searchTerm);
        }
      });
    }

    // Sort the filtered page
    const sortedPage = finalFilteredPage.sort((a, b) => {
      const fieldA = (a as any)[sort.field as SortableField];
      const fieldB = (b as any)[sort.field as SortableField];

      // Handle null or undefined values by placing them at the end
      if (fieldA == null) return 1;
      if (fieldB == null) return -1;

      if (typeof fieldA === 'number' && typeof fieldB === 'number') {
        return sort.direction === 'asc' ? fieldA - fieldB : fieldB - fieldA;
      }
      
      const stringA = String(fieldA).toLowerCase();
      const stringB = String(fieldB).toLowerCase();

      if (stringA < stringB) return sort.direction === 'asc' ? -1 : 1;
      if (stringA > stringB) return sort.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return {
      page: sortedPage,
      isDone: paginatedResults.isDone,
      continueCursor: paginatedResults.continueCursor,
    };
  },
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