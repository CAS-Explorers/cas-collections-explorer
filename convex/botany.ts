import { query } from "./_generated/server";
import { v } from "convex/values";

export const getPlantById = query({
  args: { id: v.id("botany") },
  handler: async (ctx, args) => {
    const plant = await ctx.db.get(args.id);
    return plant;
  },
});

export const searchPlants = query({
  args: {
    query: v.array(
      v.object({
        id: v.number(),
        index: v.string(),
        value: v.string(),
      }),
    ),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const { query, limit } = args;

    if (!query || query.length === 0) {
      return await ctx.db.query("botany").take(limit);
    }

    type validTypes =
      | "search_fullName"
      | "search_country"
      | "search_collectors"
      | "search_state";
    type validIndices = "collectors" | "country" | "fullName" | "state";

    // Get valid search rules (non-empty values)
    const validRules = query.filter((rule) => rule.value.trim());
    if (validRules.length === 0) {
      return await ctx.db.query("botany").take(limit);
    }

    // Start with the first rule
    const firstRule = validRules[0];
    const indexName = `search_${firstRule.index}` as validTypes;
    let results = await ctx.db
      .query("botany")
      .withSearchIndex(indexName, (q) =>
        q.search(firstRule.index as validIndices, firstRule.value),
      )
      .take(limit * 2); // Take more initially to allow for filtering

    // Filter results through each subsequent rule
    for (let i = 1; i < validRules.length; i++) {
      const rule = validRules[i];
      const currentIndex = rule.index as validIndices;
      const searchTerm = rule.value.toLowerCase().trim();

      results = results.filter((plant) => {
        const fieldValue = String(plant[currentIndex]).toLowerCase();
        return fieldValue.includes(searchTerm);
      });

      if (results.length === 0) break;
    }

    // Return only up to the limit
    return results.slice(0, limit);
  },
});
