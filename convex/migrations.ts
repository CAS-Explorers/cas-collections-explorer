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

