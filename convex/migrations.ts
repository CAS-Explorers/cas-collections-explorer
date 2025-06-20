// All migrations have been completed
// This file is kept for reference but no active migrations are needed

import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const convertCollectionObjectAttachmentsToStrings = mutation({
  args: {
    cursor: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    // Get documents using pagination with cursor
    const result = await ctx.db
      .query("botany")
      .withIndex("by_barCode")
      .order("asc")
      .paginate({ 
        numItems: 1000,
        cursor: args.cursor || null
      });
    
    const plants = result.page;
    let totalProcessed = 0;
    
    // Update each document to convert numeric collectionObjectAttachments to strings
    for (const plant of plants) {
      if (plant.collectionObjectAttachments !== undefined && 
          typeof plant.collectionObjectAttachments === 'number') {
        await ctx.db.patch(plant._id, {
          collectionObjectAttachments: String(plant.collectionObjectAttachments)
        });
        totalProcessed++;
      }
    }
    
    return { 
      success: true,
      totalProcessed,
      cursor: result.continueCursor,
      isDone: result.isDone
    };
  }
});

export const renameStationFieldNumberToCollectorNumber = mutation({
  args: {
    cursor: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    // Get documents using pagination with cursor
    const result = await ctx.db
      .query("botany")
      .withIndex("by_barCode")
      .order("asc")
      .paginate({ 
        numItems: 1000,
        cursor: args.cursor || null
      });
    
    const plants = result.page;
    let totalProcessed = 0;
    
    // Update each document to rename stationFieldNumber to collectorNumber and convert to string
    for (const plant of plants) {
      const plantWithOldField = plant as any;
      if (plantWithOldField.stationFieldNumber !== undefined) {
        const updateData: any = {};
        
        // Convert to string if it's a number
        if (typeof plantWithOldField.stationFieldNumber === 'number') {
          updateData.collectorNumber = String(plantWithOldField.stationFieldNumber);
        } else {
          updateData.collectorNumber = plantWithOldField.stationFieldNumber;
        }
        
        // Remove the old field
        updateData.stationFieldNumber = undefined;
        
        await ctx.db.patch(plant._id, updateData);
        totalProcessed++;
      }
    }
    
    return { 
      success: true,
      totalProcessed,
      cursor: result.continueCursor,
      isDone: result.isDone
    };
  }
});

export const findNonEmptyPhenology = mutation({
  args: {},
  handler: async (ctx, args) => {
    // Get a single document with non-empty phenology
    const result = await ctx.db
      .query("botany")
      .filter((q) => q.neq(q.field("phenology"), ""))
      .first();
    
    if (result) {
      console.log("Found non-empty phenology:", result.phenology);
      console.log("Accession Number:", result.accessionNumber);
      return {
        success: true,
        value: result.phenology,
        accessionNumber: result.accessionNumber,
        documentId: result._id
      };
    } else {
      console.log("No documents found with non-empty phenology");
      return {
        success: false,
        message: "No documents found with non-empty phenology"
      };
    }
  }
});

export const findNonEmptyRedactLocalityAcceptedTaxon = mutation({
  args: {},
  handler: async (ctx, args) => {
    // Get a single document with non-empty redactLocalityAcceptedTaxon
    const result = await ctx.db
      .query("botany")
      .filter((q) => q.neq(q.field("redactLocalityAcceptedTaxon"), ""))
      .first();
    
    if (result) {
      console.log("Found redactLocalityAcceptedTaxon value:", result.redactLocalityAcceptedTaxon);
      if (result.accessionNumber) {
        console.log("Accession Number:", result.accessionNumber);
      }
      if (result.collectionObjectAttachments) {
        console.log("Collection Object Attachments:", result.collectionObjectAttachments);
      }
      return {
        success: true,
        redactLocalityAcceptedTaxon: result.redactLocalityAcceptedTaxon,
        accessionNumber: result.accessionNumber,
        collectionObjectAttachments: result.collectionObjectAttachments,
        documentId: result._id
      };
    } else {
      console.log("No documents found with non-empty redactLocalityAcceptedTaxon");
      return {
        success: false,
        message: "No documents found with non-empty redactLocalityAcceptedTaxon"
      };
    }
  }
});

export const convertStartDateYearToInteger = mutation({
  args: {
    cursor: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    // Get documents using pagination with cursor
    const result = await ctx.db
      .query("botany")
      .withIndex("by_barCode")
      .order("asc")
      .paginate({ 
        numItems: 1000,
        cursor: args.cursor || null
      });
    
    const plants = result.page;
    let totalProcessed = 0;
    let convertedCount = 0;
    
    // Update each document to convert startDateYear from string to integer
    for (const plant of plants) {
      totalProcessed++;
      if (plant.startDateYear && typeof plant.startDateYear === 'string') {
        const year = parseInt(plant.startDateYear);
        if (!isNaN(year)) {
          await ctx.db.patch(plant._id, {
            startDateYear: year
          });
          convertedCount++;
        }
      }
    }
    
    console.log(`Processed ${totalProcessed} documents, converted ${convertedCount} startDateYear fields`);
    
    return { 
      success: true,
      totalProcessed,
      convertedCount,
      cursor: result.continueCursor,
      isDone: result.isDone
    };
  }
});

export const convertEndDateMonthToInteger = mutation({
  args: {
    cursor: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    // Get documents using pagination with cursor
    const result = await ctx.db
      .query("botany")
      .withIndex("by_barCode")
      .order("asc")
      .paginate({ 
        numItems: 1000,
        cursor: args.cursor || null
      });
    
    const plants = result.page;
    let totalProcessed = 0;
    let convertedCount = 0;
    
    // Update each document to convert endDateMonth from string to integer
    for (const plant of plants) {
      totalProcessed++;
      if (plant.endDateMonth && typeof plant.endDateMonth === 'string') {
        const month = parseInt(plant.endDateMonth);
        if (!isNaN(month)) {
          await ctx.db.patch(plant._id, {
            endDateMonth: month
          });
          convertedCount++;
        }
      }
    }
    
    console.log(`Processed ${totalProcessed} documents, converted ${convertedCount} endDateMonth fields`);
    
    return { 
      success: true,
      totalProcessed,
      convertedCount,
      cursor: result.continueCursor,
      isDone: result.isDone
    };
  }
});

export const convertEndDateDayToInteger = mutation({
  args: {
    cursor: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    // Get documents using pagination with cursor
    const result = await ctx.db
      .query("botany")
      .withIndex("by_barCode")
      .order("asc")
      .paginate({ 
        numItems: 1000,
        cursor: args.cursor || null
      });
    
    const plants = result.page;
    let totalProcessed = 0;
    let convertedCount = 0;
    
    // Update each document to convert endDateDay from string to integer
    for (const plant of plants) {
      totalProcessed++;
      if (plant.endDateDay && typeof plant.endDateDay === 'string') {
        const day = parseInt(plant.endDateDay);
        if (!isNaN(day)) {
          await ctx.db.patch(plant._id, {
            endDateDay: day
          });
          convertedCount++;
        }
      }
    }
    
    console.log(`Processed ${totalProcessed} documents, converted ${convertedCount} endDateDay fields`);
    
    return { 
      success: true,
      totalProcessed,
      convertedCount,
      cursor: result.continueCursor,
      isDone: result.isDone
    };
  }
});

export const convertEndDateYearToInteger = mutation({
  args: {
    cursor: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    // Get documents using pagination with cursor
    const result = await ctx.db
      .query("botany")
      .withIndex("by_barCode")
      .order("asc")
      .paginate({ 
        numItems: 1000,
        cursor: args.cursor || null
      });
    
    const plants = result.page;
    let totalProcessed = 0;
    let convertedCount = 0;
    
    // Update each document to convert endDateYear from string to integer
    for (const plant of plants) {
      totalProcessed++;
      if (plant.endDateYear && typeof plant.endDateYear === 'string') {
        const year = parseInt(plant.endDateYear);
        if (!isNaN(year)) {
          await ctx.db.patch(plant._id, {
            endDateYear: year
          });
          convertedCount++;
        }
      }
    }
    
    console.log(`Processed ${totalProcessed} documents, converted ${convertedCount} endDateYear fields`);
    
    return { 
      success: true,
      totalProcessed,
      convertedCount,
      cursor: result.continueCursor,
      isDone: result.isDone
    };
  }
});

export const copyDataToProduction = mutation({
  args: {
    cursor: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    // This would require setting up cross-environment access
    // You'd need to configure this with proper environment variables
    console.log("This is a template for cross-environment data copying");
    console.log("You would need to set up proper environment configuration");
    
    return {
      success: false,
      message: "This is a template - implement with proper environment setup"
    };
  }
});

