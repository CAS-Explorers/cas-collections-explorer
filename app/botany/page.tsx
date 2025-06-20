"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { BotanyCard } from "@/components/botany/botany-card";
import { usePaginatedQuery } from "convex/react";

// Types for numeric comparisons
type NumericFilterType = "=" | "before" | "after" | "between";

// Types for text comparisons
type TextFilterType = "=" | "contains" | "contains_any" | "in";

// Interface for a search rule
interface LocalSearchRule {
  id: number;
  index: string;
  value: string;
  numericFilter?: {
    type: NumericFilterType;
    value: string; 
    secondValue?: string; 
  };
  textFilter?: {
    type: TextFilterType;
    value: string;
    secondValue?: string; // For "in" operator to store multiple values
  };
}

// Add this validation function at the top level
const isValidRule = (rule: Partial<LocalSearchRule>) => {
  if (rule.numericFilter) {
    const value = Number(rule.numericFilter.value);
    const secondValue = rule.numericFilter.secondValue ? Number(rule.numericFilter.secondValue) : undefined;
    
    if (isNaN(value) || (secondValue !== undefined && isNaN(secondValue))) {
      return false;
    }

    if (rule.index === "latitude1") {
      return value >= -90 && value <= 90 && 
             (secondValue === undefined || (secondValue >= -90 && secondValue <= 90));
    }
    if (rule.index === "longitude1") {
      return value >= -180 && value <= 180 && 
             (secondValue === undefined || (secondValue >= -180 && secondValue <= 180));
    }
    if (rule.index === "minElevation") {
      // For minElevation, ensure it's not greater than maxElevation if provided
      if (secondValue !== undefined) {
        return value <= secondValue;
      }
      return true;
    }
    if (rule.index === "maxElevation") {
      // For maxElevation, ensure it's not less than minElevation if provided
      if (secondValue !== undefined) {
        return value <= secondValue;  // Changed from >= to <= since we want the second value to be higher
      }
      return true;
    }
    return true;
  }
  return rule.value?.trim() !== "";
};

// Add this function before the Botany component
const formatDate = (dateStr: string): string => {
  // Split the date into parts
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;

  // Format year (should be 4 digits)
  const year = parts[0];
  if (year.length !== 4) return dateStr;

  // Format month (add leading zero if needed)
  let month = parts[1];
  if (month.length === 1 && month !== '0') {
    month = '0' + month;
  }

  // Format day (add leading zero if needed)
  let day = parts[2];
  if (day.length === 1 && day !== '0') {
    day = '0' + day;
  }

  return `${year}-${month}-${day}`;
};

export default function Botany() {
  const searchParams = useSearchParams();

  const [searchRules, setSearchRules] = useState<LocalSearchRule[]>([
    { id: 1, index: "scientificName", value: "" },
  ]);
  const RESULTS_PER_PAGE = 30;

  const {
    results,
    status,
    loadMore,
    isLoading,
  } = usePaginatedQuery(
    api.botany.searchPlants,
    {
      rules: searchRules.map(rule => {
        if (rule.numericFilter) {
          return {
            field: rule.index,
            operator: rule.numericFilter.type,
            value: Number(rule.numericFilter.value),
            ...(rule.numericFilter.secondValue !== undefined && {
              secondValue: Number(rule.numericFilter.secondValue)
            })
          };
        }
        if (rule.textFilter) {
          return {
            field: rule.index,
            operator: rule.textFilter.type,
            value: rule.textFilter.value,
            // For text filters, we don't send secondValue as it's handled differently in the backend
          };
        }
        return {
          field: rule.index,
          operator: "=",
          value: rule.value
        };
      }),
    },
    { initialNumItems: RESULTS_PER_PAGE }
  );

  const handleSearch = useCallback(async () => {
    // The search will be triggered automatically by the usePaginatedQuery hook
    // when searchRules changes
  }, []); // Empty dependency array since this function doesn't depend on any values

  // Handle URL search params
  useEffect(() => {
    const query = searchParams.get("query");
    if (query) {
      try {
        const parsed = JSON.parse(decodeURIComponent(query));
        setSearchRules(parsed);
        handleSearch();
      } catch {
        handleSearch();
      }
    } else {
      handleSearch();
    }
  }, [searchParams, handleSearch]);

  const handleRuleChange = (id: number, key: string, newValue: string) => {
    setSearchRules((rules) =>
      rules.map((rule) => {
        if (rule.id === id) {
          // If changing to a numeric field, clear the value and set up numericFilter
          if (key === "index" && (newValue === "latitude1" || newValue === "longitude1" || 
                                 newValue === "minElevation" || newValue === "maxElevation" ||
                                 newValue === "startDateMonth" || newValue === "startDateDay" || newValue === "startDateYear" ||
                                 newValue === "endDateMonth" || newValue === "endDateDay" || newValue === "endDateYear")) {
            return {
              ...rule,
              [key]: newValue,
              value: "",
              numericFilter: {
                type: "=",
                value: "0"
              }
            };
          }
          // If changing to a text field, set up textFilter
          if (key === "index" && !["latitude1", "longitude1", "minElevation", "maxElevation",
                                  "startDateMonth", "startDateDay", "startDateYear",
                                  "endDateMonth", "endDateDay", "endDateYear"].includes(newValue)) {
            return {
              ...rule,
              [key]: newValue,
              value: "",
              textFilter: {
                type: "=",
                value: ""
              }
            };
          }
          return { ...rule, [key]: newValue };
        }
        return rule;
      }),
    );
  };

  const handleNumericFilterChange = (
    id: number,
    filterType: NumericFilterType,
    value: string,
    secondValue?: string
  ) => {
    setSearchRules((rules) =>
      rules.map((rule) =>
        rule.id === id
          ? {
              ...rule,
              value: "", // Clear the value field
              numericFilter: {
                type: filterType,
                value,
                ...(secondValue !== undefined ? { secondValue } : {}),
              },
            }
          : rule
      )
    );
  };

  const handleTextFilterChange = (
    id: number,
    filterType: TextFilterType,
    value: string,
    secondValue?: string
  ) => {
    setSearchRules((rules) =>
      rules.map((rule) => {
        if (rule.id === id) {
          return {
            ...rule,
            value: "", // Clear the value field
            textFilter: {
              type: filterType,
              value: value,
              ...(secondValue !== undefined ? { secondValue } : {}),
            },
          };
        }
        return rule;
      })
    );
  };

  const handleLoadMore = () => {
    if (status === "CanLoadMore") {
      loadMore(RESULTS_PER_PAGE);
    }
  };

  const render = () => {
    return (
      <div className="w-full min-h-screen bg-gradient-to-b from-white to-gray-50/50">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {renderSearch()}
          {renderSearchResults()}
        </div>
      </div>
    );
  };

  const renderSearch = () => {
    const renderSearchInputAndButton = () => {
      const addSearchRule = () => {
        setSearchRules((rules) => [
          ...rules,
          { id: Date.now(), index: "scientificName", value: "" },
        ]);
      };

      const removeSearchRule = (id: number) => {
        setSearchRules((rules) => rules.filter((rule) => rule.id !== id));
      };

      return (
        <div className="flex flex-col gap-3 w-full">
          {searchRules.map((rule) => (
            <div key={rule.id} className="flex gap-2 items-center">
              <select
                value={rule.index}
                onChange={(e) => handleRuleChange(rule.id, "index", e.target.value)}
                className="px-3 py-2 rounded-lg border border-green-300 bg-white text-sm"
              >
                <option value="scientificName">Scientific Name</option>
                <option value="country">Country</option>
                <option value="collectors">Collectors</option>
                <option value="state">State</option>
                <option value="county">County</option>
                <option value="class">Class</option>
                <option value="order">Order</option>
                <option value="family">Family</option>
                <option value="genus">Genus</option>
                <option value="species">Species</option>
                <option value="herbarium">Herbarium</option>
                <option value="habitat">Habitat</option>
                <option value="specimenDescription">Specimen Description</option>
                <option value="localityContinued">Locality Continued</option>
                <option value="determiner">Determiner</option>
                <option value="continent">Continent</option>
                <option value="town">Town</option>
                <option value="typeStatusName">Type Status</option>
                <option value="preparations">Preparations</option>
                <option value="collectionObjectAttachments">Collection Object Attachment</option>
                <option value="localityName">Locality</option>
                <option value="determinedDate">Determination Date</option>
                <option value="verbatimDate">Verbatim Date</option>
                <option value="barCode">Bar Code</option>
                <option value="accessionNumber">Accession Number</option>
                <option value="collectorNumber">Collector Number</option>
                <option value="minElevation">Min Elevation</option>
                <option value="maxElevation">Max Elevation</option>
                <option value="originalElevationUnit">Elevation Unit</option>
                <option value="latitude1">Latitude</option>
                <option value="longitude1">Longitude</option>
                <option value="notes">Notes</option>
                <option value="phenology">Phenology</option>
                <option value="redactLocalityCo">Redact Locality Co</option>
                <option value="redactLocalityTaxon">Redact Locality Taxon</option>
                <option value="redactLocalityAcceptedTaxon">Redact Locality Accepted Taxon</option>
                <option value="timestampModified">Timestamp Modified</option>
                <option value="startDateMonth">Start Date Month</option>
                <option value="startDateDay">Start Date Day</option>
                <option value="startDateYear">Start Date Year</option>
                <option value="endDateMonth">End Date Month</option>
                <option value="endDateDay">End Date Day</option>
                <option value="endDateYear">End Date Year</option>
              </select>

              {/* Show numeric filter options for latitude and longitude */}
              {(rule.index === "latitude1" || rule.index === "longitude1" || 
                rule.index === "minElevation" || rule.index === "maxElevation" ||
                rule.index === "startDateMonth" || rule.index === "startDateDay" || rule.index === "startDateYear" ||
                rule.index === "endDateMonth" || rule.index === "endDateDay" || rule.index === "endDateYear") && (
                <div className="flex gap-2 items-center">
                  <select
                    value={rule.numericFilter?.type || "="}
                    onChange={(e) => {
                      const type = e.target.value as NumericFilterType;
                      handleNumericFilterChange(
                        rule.id,
                        type,
                        rule.numericFilter?.value || "",
                        rule.numericFilter?.secondValue
                      );
                    }}
                    className="px-3 py-2 rounded-lg border border-green-300 bg-white text-sm"
                  >
                    <option value="=">=</option>
                    <option value="before">Before</option>
                    <option value="after">After</option>
                    <option value="between">Between</option>
                  </select>
                  <Input
                    type="text"
                    value={rule.numericFilter?.value ?? ""}
                    placeholder={rule.index === "latitude1" ? "Latitude" : 
                              rule.index === "longitude1" ? "Longitude" :
                              rule.index === "minElevation" ? "Min Elevation" :
                              rule.index === "maxElevation" ? "Max Elevation" :
                              rule.index === "startDateMonth" ? "Start Month (1-12)" :
                              rule.index === "startDateDay" ? "Start Day (1-31)" :
                              rule.index === "startDateYear" ? "Start Year" :
                              rule.index === "endDateMonth" ? "End Month (1-12)" :
                              rule.index === "endDateDay" ? "End Day (1-31)" :
                              "End Year"}
                    onChange={(e) => {
                      handleNumericFilterChange(
                        rule.id,
                        rule.numericFilter?.type || "=",
                        e.target.value,
                        rule.numericFilter?.secondValue
                      );
                    }}
                    className={`w-32 ${!isValidRule(rule) ? "border-red-500" : ""}`}
                  />
                  {!isValidRule(rule) && (
                    <span className="text-red-500 text-sm">
                      Invalid {rule.index === "latitude1" ? "latitude" : 
                              rule.index === "longitude1" ? "longitude" :
                              rule.index === "minElevation" ? "min elevation" :
                              rule.index === "maxElevation" ? "max elevation" :
                              rule.index === "startDateMonth" ? "start month" :
                              rule.index === "startDateDay" ? "start day" :
                              rule.index === "startDateYear" ? "start year" :
                              rule.index === "endDateMonth" ? "end month" :
                              rule.index === "endDateDay" ? "end day" :
                              rule.index === "endDateYear" ? "end year" :
                              "value"}
                    </span>
                  )}
                  {rule.numericFilter?.type === "between" && (
                    <>
                      <Input
                        type="text"
                        value={rule.numericFilter?.secondValue ?? ""}
                        placeholder="And"
                        onChange={(e) => {
                          handleNumericFilterChange(
                            rule.id,
                            "between",
                            rule.numericFilter?.value || "",
                            e.target.value
                          );
                        }}
                        className={`w-32 ${!isValidRule(rule) ? "border-red-500" : ""}`}
                      />
                    </>
                  )}
                </div>
              )}

              {/* Show text filter options for non-numeric fields */}
              {!["latitude1", "longitude1", "minElevation", "maxElevation", 
                  "startDateMonth", "startDateDay", "startDateYear",
                  "endDateMonth", "endDateDay", "endDateYear"].includes(rule.index) && (
                <div className="flex gap-2 items-center">
                  <select
                    value={rule.textFilter?.type || "="}
                    onChange={(e) => {
                      const type = e.target.value as TextFilterType;
                      handleTextFilterChange(
                        rule.id,
                        type,
                        rule.textFilter?.value || "",
                        rule.textFilter?.secondValue
                      );
                    }}
                    className="px-3 py-2 rounded-lg border border-green-300 bg-white text-sm"
                  >
                    <option value="=">=</option>
                    <option value="contains">Contains</option>
                    <option value="contains_any">Contains Any</option>
                    <option value="in">In</option>
                  </select>
                <Input
                    type="text"
                    value={rule.textFilter?.value ?? ""}
                    placeholder={rule.textFilter?.type === "in" ? "Enter values (comma-separated)..." : `Search ${rule.index}...`}
                    onChange={(e) => {
                      handleTextFilterChange(
                        rule.id,
                        rule.textFilter?.type || "=",
                        e.target.value,
                        rule.textFilter?.secondValue
                      );
                    }}
                    onBlur={(e) => {
                      if (rule.index === "determinedDate") {
                        handleTextFilterChange(
                          rule.id,
                          rule.textFilter?.type || "=",
                          formatDate(e.target.value),
                          rule.textFilter?.secondValue
                        );
                      }
                    }}
                  className="flex-1"
                />
                </div>
              )}

              {searchRules.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeSearchRule(rule.id)}
                >
                  ✕
                </Button>
              )}
            </div>
          ))}
          <div className="flex gap-3 justify-between">
            <Button
              onClick={addSearchRule}
              variant="outline"
              className="text-green-700"
            >
              + Add Search Rule
            </Button>
            <Button onClick={handleSearch}>Search</Button>
          </div>
        </div>
      );
    };

    return (
      <div className="relative">
        {/* Decorative background elements */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-40 right-0 h-72 w-72 rounded-full bg-green-100/30 blur-3xl"></div>
          <div className="absolute -top-20 left-0 h-72 w-72 rounded-full bg-emerald-100/30 blur-3xl"></div>
        </div>

        <div className="text-center mb-12 space-y-4">
          <h1 className="text-4xl sm:text-5xl font-bold mb-2 bg-gradient-to-r from-green-700 to-emerald-700 bg-clip-text text-transparent">
            Botany Collection Search
          </h1>
          <p className="text-gray-600 text-lg max-w-2xl mx-auto">
            Explore our extensive database of botanical specimens
          </p>
        </div>

        <div className="max-w-2xl mx-auto mb-8">
          <div className="flex gap-3">{renderSearchInputAndButton()}</div>
        </div>
      </div>
    );
  };

  const renderSearchResults = () => {
    return (
      <div className="relative">
        {/* Results count */}
        {results && results.length > 0 && (
          <div className="mb-6 text-gray-600">
            Showing{" "}
            <span className="font-medium text-green-700">{results.length}</span>{" "}
            specimens
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6 auto-rows-fr">
          {results === undefined || results.length === 0 ? (
            <div className="col-span-full text-center py-16">
              <div className="text-gray-500 space-y-2">
                <p className="text-lg">No results found.</p>
                <p className="text-sm">
                  Try adjusting your search terms or filters.
                </p>
              </div>
            </div>
          ) : (
            <>
              {results.map((plant) => (
                <BotanyCard 
                  key={plant._id} 
                  plant={plant} 
                />
              ))}
              {status === "CanLoadMore" && (
                <div className="col-span-full flex justify-center mt-8">
                  <Button
                    onClick={handleLoadMore}
                    variant="outline"
                    className="text-green-700"
                    disabled={isLoading}
                  >
                    {isLoading ? "Loading..." : "Load More"}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  return render();
}
