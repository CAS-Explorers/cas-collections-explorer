import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import axios from "axios";
import dotenv from "dotenv";
import fs from "fs";
import type { Doc } from "../convex/_generated/dataModel";

// Load .env.local for Convex deployment URL and admin key
dotenv.config({ path: ".env.local" });

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL;
const CONVEX_DEPLOYMENT = process.env.CONVEX_DEPLOYMENT;
const CONVEX_DEPLOY_KEY = process.env.CONVEX_DEPLOY_KEY;

if (!CONVEX_URL && !CONVEX_DEPLOYMENT) {
  throw new Error("Convex URL or deployment not set in .env.local");
}
if (!CONVEX_DEPLOY_KEY) {
  throw new Error("Convex deploy key not set in .env.local");
}

// The ConvexHttpClient does not accept adminKey/deployKey in the browser SDK
const convex = new ConvexHttpClient(CONVEX_URL || `https://${CONVEX_DEPLOYMENT}.convex.cloud`);

function extractImageUrl(url: string | undefined | null, resolution: string): string | null {
  if (!url || url.length === 0) return null;
  try {
    const jsonString = url.replace(/([{,])(\s*)([A-Za-z]+)(\s*):/g, '$1"$3":');
    const data = JSON.parse(jsonString);
    if (!Array.isArray(data) || data.length === 0) return null;
    const imageUrl = data[0].AttachmentLocation;
    if (!imageUrl) return null;
    return `http://ibss-images.calacademy.org/fileget?coll=Botany&type=T&filename=${imageUrl}&scale=${resolution}`;
  } catch (error) {
    return null;
  }
}

function isFallbackImage(url: string | null): boolean {
  if (!url) return true;
  // Add all fallback patterns you use
  return url.includes("cal_academy.png") || url.includes("placeholder") || url.includes("no-image");
}

async function validateImages() {
  console.log("Fetching all botany records...");
  // Fetch all botany records (implement pagination if needed)
  let after: string | undefined = undefined;
  let totalUpdated = 0;
  while (true) {
    const batch: Doc<'botany'>[] = await convex.query(api.botany.listPlants, { after });
    if (!batch || batch.length === 0) break;
    for (const plant of batch) {
      const url = extractImageUrl(plant.img, "500");
      if (plant.scientificName && plant.scientificName.toLowerCase().includes("coccoloba steinbachii")) {
        console.log("DEBUG Coccoloba steinbachii img:", plant.img, "Extracted URL:", url);
      }
      let hasWorkingImage = false;
      if (url && !isFallbackImage(url)) {
        try {
          const response = await axios.head(url, { timeout: 5000 });
          hasWorkingImage = response.status === 200;
          if (hasWorkingImage) {
            console.log(`VALID IMAGE: ${plant.scientificName} (${plant._id}) -> ${url}`);
          }
        } catch (err) {
          hasWorkingImage = false;
        }
      }
      if (plant.hasWorkingImage !== hasWorkingImage) {
        await convex.mutation(api.botany.updateHasWorkingImage, {
          id: plant._id,
          hasWorkingImage,
        });
        totalUpdated++;
        console.log(`Updated ${plant._id}: hasWorkingImage=${hasWorkingImage}`);
      }
    }
    after = batch[batch.length - 1]?._id;
  }
  console.log(`Done! Updated ${totalUpdated} records.`);
}

validateImages().catch((err) => {
  console.error(err);
  process.exit(1);
}); 