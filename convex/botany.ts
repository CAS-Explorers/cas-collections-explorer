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

type SearchField = "scientificName" | "country" | "collectors" | "state" | "class" | "order" | "family" | "determiner" | "continent" | "town" | "typeStatusName" | "preparations" | "localityName" | "determinedDate" | "verbatimDate" | "genus" | "herbarium" | "habitat" | "species" | "county" | "localityContinued" | "specimenDescription" | "originalElevationUnit" | "collectionObjectAttachments" | "collectorNumber" | "startDateMonth" | "startDateDay" | "startDateYear" | "endDateMonth" | "endDateDay" | "endDateYear" | "notes" | "phenology" | "redactLocalityCo" | "redactLocalityTaxon" | "redactLocalityAcceptedTaxon";
type SearchIndex = "search_scientificName" | "search_country" | "search_collectors" | "search_state" | "search_class" | "search_order" | "search_family" | "search_determiner" | "search_continent" | "search_town" | "search_typeStatusName" | "search_preparations" | "search_localityName" | "search_determinedDate" | "search_verbatimDate" | "search_genus" | "search_herbarium" | "search_habitat" | "search_species" | "search_county" | "search_localityContinued" | "search_specimenDescription" | "search_originalElevationUnit" | "search_collectionObjectAttachments" | "search_collectorNumber" | "search_startDateMonth" | "search_startDateDay" | "search_startDateYear" | "search_endDateMonth" | "search_endDateDay" | "search_endDateYear" | "search_notes" | "search_phenology" | "search_redactLocalityCo" | "search_redactLocalityTaxon" | "search_redactLocalityAcceptedTaxon";
type CoordinateField = "longitude1" | "latitude1" | "barCode" | "accessionNumber" | "minElevation" | "maxElevation";

export const getPlantById = query({
  args: { id: v.id("botany") },
  handler: async (ctx, args) => {
    const plant = await ctx.db.get(args.id);
    return plant;
  },
});

export const searchPlants = query({
  args: {
    rules: v.array(v.object({
      field: v.string(),
      operator: v.string(),
      value: v.union(v.string(), v.number()),
      secondValue: v.optional(v.number()),
    })),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const { rules, paginationOpts } = args;

    // Get valid search rules (non-empty values)
    const validRules = rules.filter(rule => {
      if (rule.field === "longitude1" || rule.field === "latitude1" || rule.field === "barCode" || rule.field === "accessionNumber" || rule.field === "minElevation" || rule.field === "maxElevation") {
        const numValue = Number(rule.value);
        return !isNaN(numValue);
      }
      return String(rule.value).trim() !== "";
    });

    if (!rules.length || validRules.length === 0) {
      // For the default case (no filters), use pagination
      return await ctx.db
        .query("botany")
        .order("desc")
        .paginate(paginationOpts);
    }

    // Start with the first rule
    const firstRule = validRules[0];

    // Handle coordinate-based queries using indexes
    if (firstRule.field === "longitude1" || firstRule.field === "latitude1" || 
        firstRule.field === "barCode" || firstRule.field === "accessionNumber" ||
        firstRule.field === "minElevation" || firstRule.field === "maxElevation") {
      const numValue = Number(firstRule.value);
      if (isNaN(numValue)) {
        return {
          page: [],
          isDone: true,
          continueCursor: ""
        };
      }
      // Validate ranges
      if (firstRule.field === "longitude1" && (numValue > 180 || numValue < -180)) {
        return {
          page: [],
          isDone: true,
          continueCursor: ""
        };
      }
      if (firstRule.field === "latitude1" && (numValue > 90 || numValue < -90)) {
        return {
          page: [],
          isDone: true,
          continueCursor: ""
        };
      }
      const indexName = firstRule.field === "longitude1" ? "by_longitude" : 
                       firstRule.field === "latitude1" ? "by_latitude" :
                       firstRule.field === "barCode" ? "by_barCode" :
                       firstRule.field === "accessionNumber" ? "by_accessionNumber" :
                       firstRule.field === "minElevation" ? "by_minElevation" :
                       "by_maxElevation";
      const field = firstRule.field as CoordinateField;
      let q = ctx.db.query("botany").withIndex(indexName, (q) => {
        switch (firstRule.operator) {
          case "=":
            return q.eq(field, numValue);
          case "after":
            return q.gt(field, numValue);
          case "before":
            return q.lt(field, numValue);
          case "between":
            const secondValue = Number(firstRule.secondValue);
            if (isNaN(secondValue)) {
              return q.eq(field, NaN); // will return nothing
            }
            return q.gte(field, numValue).lte(field, secondValue);
          default:
            return q.eq(field, NaN); // will return nothing
        }
      });
      const paginatedResults = await q.paginate(paginationOpts);
      // Apply subsequent rules as filters
      if (validRules.length > 1) {
        const filteredPage = paginatedResults.page.filter(plant => {
          for (let i = 1; i < validRules.length; i++) {
            const rule = validRules[i];
            if (rule.field === "longitude1" || rule.field === "latitude1" || rule.field === "barCode" || rule.field === "accessionNumber" || rule.field === "minElevation" || rule.field === "maxElevation") {
              const numValue = Number(rule.value);
              if (isNaN(numValue)) continue;
              if (rule.field === "longitude1" && (numValue > 180 || numValue < -180)) continue;
              if (rule.field === "latitude1" && (numValue > 90 || numValue < -90)) continue;
              const plantValue = Number(plant[rule.field as CoordinateField]);
              if (isNaN(plantValue)) return false;
              switch (rule.operator) {
                case "=":
                  if (plantValue !== numValue) return false;
                  break;
                case "after":
                  if (plantValue <= numValue) return false;
                  break;
                case "before":
                  if (plantValue >= numValue) return false;
                  break;
                case "between":
                  const secondValue = Number(rule.secondValue);
                  if (isNaN(secondValue) || plantValue < numValue || plantValue > secondValue) return false;
                  break;
                default:
                  return false;
              }
            } else {
              let searchTerm = String(rule.value).toLowerCase().trim();
              if (rule.field === "country") {
                const countryName = getCountryFromCode(searchTerm);
                if (countryName) {
                  searchTerm = countryName.toLowerCase();
                }
              }
              const fieldValue = String(plant[rule.field as SearchField]).toLowerCase();
              if (!fieldValue.includes(searchTerm)) return false;
            }
          }
          return true;
        });
        return {
          ...paginatedResults,
          page: filteredPage
        };
      }
      return paginatedResults;
    }

    // Use search index for non-numeric fields
    let searchValue = String(firstRule.value);
    if (firstRule.field === "country") {
      const countryName = getCountryFromCode(searchValue);
      if (countryName) {
        searchValue = countryName;
      }
    }

    const indexName = `search_${firstRule.field}` as SearchIndex;
    const q = ctx.db.query("botany").withSearchIndex(indexName, (q) => {
      switch (firstRule.operator) {
                case "=":
          // For exact match, we'll use search and filter the results
          return q.search(firstRule.field as SearchField, searchValue);
        case "contains":
          return q.search(firstRule.field as SearchField, searchValue);
        case "contains_any":
          // For contains_any, join all terms with spaces to search for any of them
          const terms = searchValue.split(/[,\s]+/).filter(term => term.trim() !== "");
          // Convert country codes to full names if we're searching by country
          const searchTerms = firstRule.field === "country" 
            ? terms.map(term => {
                const countryName = getCountryFromCode(term);
                return countryName || term;
              })
            : terms;
          return q.search(firstRule.field as SearchField, searchTerms.join(" "));
        case "in":
          // For in, we'll search for all values and combine results
          const values = searchValue.split(/[,\s]+/).filter(v => v.trim() !== "");
          return q.search(firstRule.field as SearchField, values.join(" "));
                default:
          return q.search(firstRule.field as SearchField, searchValue);
              }
    });

    const paginatedResults = await q.paginate(paginationOpts);

    // For exact matches, we need to filter the results
    if (firstRule.operator === "=") {
      const filteredPage = paginatedResults.page.filter((plant: Doc<"botany">) => {
        const fieldValue = String(plant[firstRule.field as SearchField]).toLowerCase();
        // For determinedDate, we want exact string matching
        if (firstRule.field === "determinedDate") {
          return fieldValue === searchValue.toLowerCase();
        }
        return fieldValue === searchValue.toLowerCase();
      });
      return {
        ...paginatedResults,
        page: filteredPage
      };
    }

    // For contains_any, we need to filter the results to match any of the terms
    if (firstRule.operator === "contains_any") {
      // Split by both comma and space, then filter out empty strings
      const terms = searchValue.split(/[,\s]+/).filter(term => term.trim() !== "").map(term => term.trim().toLowerCase());
      
      // Filter the results to match any of the terms
      const filteredPage = paginatedResults.page.filter((plant: Doc<"botany">) => {
        const fieldValue = String(plant[firstRule.field as SearchField]).toLowerCase();
        // Check if the field value contains any of the terms
        return terms.some(term => {
          // For country field, handle country codes
          if (firstRule.field === "country") {
            const countryName = getCountryFromCode(term);
                if (countryName) {
              return fieldValue.includes(countryName.toLowerCase());
                }
              }
          return fieldValue.includes(term);
        });
      });

      // Return the filtered results with the original pagination info
        return {
          ...paginatedResults,
          page: filteredPage
        };
      }

      return paginatedResults;
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