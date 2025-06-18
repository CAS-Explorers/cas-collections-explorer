import { mutation } from "./_generated/server";
import { Doc } from "./_generated/dataModel";
import { v } from "convex/values";

export const migrateModifierToHerbarium = mutation({
  args: {
    cursor: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    // Get documents using pagination with cursor
    const result = await ctx.db
      .query("botany")
      .withIndex("by_catalogNumber")
      .order("asc")
      .paginate({ 
        numItems: 1000,
        cursor: args.cursor || null
      });
    
    const plants = result.page;
    let totalProcessed = 0;
    
    // Update each document
    for (const plant of plants) {
      const plantDoc = plant as Doc<"botany"> & { modifier: string };
      // Update herbarium field if it's not already set
      if (!plantDoc.herbarium) {
        await ctx.db.patch(plant._id, {
          herbarium: plantDoc.modifier || "" // Use empty string if modifier is empty
        });
      }
      totalProcessed++;
    }
    
    return { 
      success: true,
      totalProcessed,
      cursor: result.continueCursor,
      isDone: result.isDone
    };
  }
});

export const migrateRemarksToHabitat = mutation({
  args: {
    cursor: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    // Get documents using pagination with cursor
    const result = await ctx.db
      .query("botany")
      .withIndex("by_catalogNumber")
      .order("asc")
      .paginate({ 
        numItems: 1000,
        cursor: args.cursor || null
      });
    
    const plants = result.page;
    let totalProcessed = 0;
    
    // Update each document
    for (const plant of plants) {
      const plantDoc = plant as Doc<"botany"> & { remarks: string };
      // Update habitat field if it's not already set
      if (!plantDoc.habitat) {
        await ctx.db.patch(plant._id, {
          habitat: plantDoc.remarks || "" // Use empty string if remarks is empty
        });
      }
      totalProcessed++;
    }
    
    return { 
      success: true,
      totalProcessed,
      cursor: result.continueCursor,
      isDone: result.isDone
    };
  }
}); 

