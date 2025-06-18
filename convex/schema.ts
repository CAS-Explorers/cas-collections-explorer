import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export const Plant = {
  cas_id: v.string(),
  altCatalogNumber: v.union(v.float64(), v.string()),
  catalogNumber: v.float64(),
  ce_endDate: v.union(v.float64(), v.string()),
  ce_endDate1: v.union(v.float64(), v.string()),
  ce_startDate: v.union(v.float64(), v.string()),
  ce_startDate1: v.union(v.float64(), v.string()),
  class: v.string(),
  co_remarks: v.union(v.float64(), v.string()),
  co_yesNo2: v.union(v.float64(), v.string()),
  collectionObjectAttachments: v.union(v.float64(), v.string()),
  collectors: v.string(),
  continent: v.string(),
  county: v.string(),
  country: v.string(),
  determinedDate: v.string(),
  determiner: v.string(),
  endDate: v.union(v.float64(), v.string()),
  endDateVerbatim: v.string(),
  family: v.string(),
  fullName: v.string(),
  genus: v.string(),
  geoc: v.string(),
  img: v.string(),
  latitude1: v.union(v.float64(), v.string()),
  localityName: v.string(),
  longitude1: v.union(v.float64(), v.string()),
  maxElevation: v.union(v.float64(), v.string()),
  minElevation: v.union(v.float64(), v.string()),
  modifier: v.string(),
  herbarium: v.string(),
  order: v.string(),
  originalElevationUnit: v.string(),
  preparations: v.string(),
  remarks: v.string(),
  species: v.string(),
  startDate: v.union(v.float64(), v.string()),
  state: v.string(),
  stationFieldNumber: v.union(v.float64(), v.string()),
  text1: v.union(v.float64(), v.string()),
  text2: v.union(v.float64(), v.string()),
  timestampModified: v.string(),
  town: v.string(),
  tx_yesNo2: v.union(v.float64(), v.string()),
  typeStatusName: v.string(),
  verbatimDate: v.union(v.float64(), v.string()),
  yesNo2: v.union(v.float64(), v.string()),
};

export default defineSchema({
  ...authTables,
  numbers: defineTable({
    value: v.number(),
  }),
  botany: defineTable(Plant)
    .index("by_longitude", ["longitude1"])
    .index("by_latitude", ["latitude1"])
    .index("by_minElevation", ["minElevation"])
    .index("by_maxElevation", ["maxElevation"])
    .index("by_catalogNumber", ["catalogNumber"])
    .index("by_altCatalogNumber", ["altCatalogNumber"])
    .searchIndex("search_fullName", {
      searchField: "fullName",
    })
    .searchIndex("search_country", {
      searchField: "country",
    })
    .searchIndex("search_collectors", {
      searchField: "collectors",
    })
    .searchIndex("search_state", {
      searchField: "state",
    })
    .searchIndex("search_class", {
      searchField: "class",
    })
    .searchIndex("search_order", {
      searchField: "order",
    })
    .searchIndex("search_family", {
      searchField: "family",
    })
    .searchIndex("search_determiner", {
      searchField: "determiner",
    })
    .searchIndex("search_continent", {
      searchField: "continent",
    })
    .searchIndex("search_town", {
      searchField: "town",
    })
    .searchIndex("search_typeStatusName", {
      searchField: "typeStatusName",
    })
    .searchIndex("search_preparations", {
      searchField: "preparations",
    })
    .searchIndex("search_localityName", {
      searchField: "localityName",
    })
    .searchIndex("search_determinedDate", {
      searchField: "determinedDate",
    })
    .searchIndex("search_verbatimDate", {
      searchField: "verbatimDate",
    }),
});
//contains any works on a string field like "Vernon Oswald, Lowell Ahart" by doing a substring match.