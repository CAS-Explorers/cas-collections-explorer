import { query } from "./_generated/server";
import { v } from "convex/values";

export const getPlants = query({
  args: {
    qty: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.query("botany").take(args.qty);
  },
});

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

    const searchPromises = query.map(({ index, value }) => {
      const indexName = `search_${index}` as validTypes;
      if (!indexName || !value.trim()) return Promise.resolve([]);
      return ctx.db
        .query("botany")
        .withSearchIndex(indexName, (q) =>
          q.search(index as validIndices, value),
        )
        .take(limit);
    });

    const results = await Promise.all(searchPromises);

    const seen = new Set();
    const combined = [];
    for (const group of results) {
      for (const plant of group) {
        const id = plant._id.toString();
        if (!seen.has(id)) {
          seen.add(id);
          combined.push(plant);
        }
        if (combined.length >= limit) break;
      }
      if (combined.length >= limit) break;
    }

    return combined;
  },
});
