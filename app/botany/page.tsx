"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { BotanyCard } from "@/components/botany/botany-card";
import { useQuery, useMutation } from "convex/react";
import { LoadingSpinner, LoadingCard } from "@/components/ui/loading-spinner";
import { GoogleMap, Marker, useJsApiLoader, InfoWindow, OverlayView, DrawingManager, Rectangle } from '@react-google-maps/api';
import { extractImageUrl } from '@/lib/utils';
import { useQuery as useConvexQuery } from "convex/react";

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

type Sort = {
  field: string;
  direction: 'asc' | 'desc';
};

// Add these to the list of fields that use numeric filters
const numericFields = [
  "latitude1", "longitude1", "minElevation", "maxElevation",
  "startDateMonth", "startDateDay", "startDateYear",
  "endDateMonth", "endDateDay", "endDateYear",
  "barCode", "accessionNumber"
];

// Add this at the top of the file, outside any component
const GOOGLE_MAP_LIBRARIES = ['drawing'] as any;

// Update MapView props
type MapViewProps = {
  plants: any[],
  selectArea: boolean,
  areaBounds: google.maps.LatLngBoundsLiteral | null,
  setAreaBounds: (b: google.maps.LatLngBoundsLiteral | null) => void,
  handleRectangleComplete: (rectangle: google.maps.Rectangle) => void,
  rectangleRef: React.MutableRefObject<google.maps.Rectangle | null>,
  rectangleActive: boolean,
  setRectangleActive: React.Dispatch<React.SetStateAction<boolean>>,
  drawingMode: google.maps.drawing.OverlayType | null,
  setDrawingMode: React.Dispatch<React.SetStateAction<google.maps.drawing.OverlayType | null>>,
  setHasSearched: React.Dispatch<React.SetStateAction<boolean>>,
};

// MapView component for displaying pins
function MapView({ plants, selectArea, areaBounds, setAreaBounds, handleRectangleComplete, rectangleRef, rectangleActive, setRectangleActive, drawingMode, setDrawingMode, setHasSearched }: MapViewProps) {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
    libraries: GOOGLE_MAP_LIBRARIES,
  });
  const [showDrawButton, setShowDrawButton] = useState(false);
  const [mapInteractive, setMapInteractive] = useState(true);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 20, lng: 0 });
  const [mapZoom, setMapZoom] = useState(3);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markers = plants.filter(p =>
    typeof p.latitude1 === 'number' && typeof p.longitude1 === 'number' &&
    !isNaN(p.latitude1) && !isNaN(p.longitude1)
  );
  const [selectedPlant, setSelectedPlant] = useState<any | null>(null);
  const PLACEHOLDER_IMAGE = "/cal_academy.png";
  const [forceHideRectangle, setForceHideRectangle] = useState(false);
  const rectanglesRef = useRef<google.maps.Rectangle[]>([]);
  const [drawnRectangle, setDrawnRectangle] = useState<google.maps.Rectangle | null>(null);
  const allDrawnRectangles = useRef<google.maps.Rectangle[]>([]);
  const [drawAreaActive, setDrawAreaActive] = useState(false);

  // Show DrawingManager if selectArea is true and no rectangle exists
  useEffect(() => {
    if (!selectArea || areaBounds) {
      setDrawingMode(null);
    }
  }, [selectArea, areaBounds]);

  // Remove rectangle when areaBounds is cleared
  useEffect(() => {
    if (!areaBounds && rectangleRef.current) {
      rectangleRef.current.setMap(null);
      rectangleRef.current = null;
      setRectangleActive(false);
    }
  }, [areaBounds]);

  // Remove rectangle on unmount
  useEffect(() => {
    return () => {
      if (rectangleRef.current) {
        rectangleRef.current.setMap(null);
        rectangleRef.current = null;
      }
      allDrawnRectangles.current.forEach(rect => {
        if (rect) rect.setMap(null);
      });
      allDrawnRectangles.current = [];
    };
  }, []);

  // Handler for rectanglecomplete
  // This function is now passed as a prop to MapView

  // Remove Area button handler - moved inside MapView component
  const handleRemoveArea = () => {
    allDrawnRectangles.current.forEach(rect => {
      rect.setEditable(false);
      rect.setDraggable(false);
      rect.setMap(null);
    });
    allDrawnRectangles.current = [];
    setDrawnRectangle(null);
    rectangleRef.current = null;
    setRectangleActive(false);
    setAreaBounds(null);
    setHasSearched(false);
    setDrawingMode(null);
    setForceHideRectangle(true);
  };

  // Add effect to reset forceHideRectangle
  useEffect(() => {
    if (forceHideRectangle) {
      setTimeout(() => setForceHideRectangle(false), 0);
    }
  }, [forceHideRectangle]);

  useEffect(() => {
    if (areaBounds) setDrawAreaActive(false);
  }, [areaBounds]);

  if (!isLoaded) return <div className="w-full h-[500px] flex items-center justify-center">Loading map...</div>;
  return (
    <div className={`w-full h-[500px] my-8 rounded-lg overflow-hidden border relative ${drawAreaActive ? 'ring-4 ring-green-400' : ''}`}>
      <GoogleMap
        mapContainerStyle={{ width: '100%', height: '100%' }}
        center={mapCenter}
        zoom={mapZoom}
        onLoad={map => { mapRef.current = map; }}
        onIdle={() => {
          if (mapRef.current) {
            const c = mapRef.current.getCenter();
            const z = mapRef.current.getZoom();
            if (c) setMapCenter({ lat: c.lat(), lng: c.lng() });
            if (z) setMapZoom(z);
          }
        }}
        options={{
          draggable: true,
          scrollwheel: true,
          disableDoubleClickZoom: false,
          gestureHandling: 'auto',
          zoomControl: true,
        }}
      >
        {markers.map((plant, i) => (
          <Marker
            key={plant._id || i}
            position={{ lat: plant.latitude1, lng: plant.longitude1 }}
            title={plant.scientificName || ''}
            onClick={() => setSelectedPlant(plant)}
          />
        ))}
        {selectedPlant && (
          <OverlayView
            position={{ lat: selectedPlant.latitude1, lng: selectedPlant.longitude1 }}
            mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
          >
            <div className="w-64 bg-white rounded-lg shadow-xl border border-gray-200" style={{padding: 0, marginBottom: 16}}>
              <div className="relative" style={{padding: 0, margin: 0}}>
                <img
                  src={extractImageUrl(selectedPlant.img, "500") || PLACEHOLDER_IMAGE}
                  alt={selectedPlant.scientificName}
                  className="object-cover"
                  style={{ width: '100%', height: 'auto', aspectRatio: '4/3', display: 'block', borderRadius: '0.5rem 0.5rem 0 0', margin: 0, padding: 0 }}
                />
                <button
                  onClick={() => setSelectedPlant(null)}
                  className="absolute top-2 right-2 bg-white/80 hover:bg-white rounded-full p-1 shadow-md border border-gray-300 z-10"
                  aria-label="Close"
                  style={{ lineHeight: 0 }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="font-semibold text-green-800 mb-1 mt-2 px-4">{selectedPlant.scientificName}</div>
              <div className="text-xs text-gray-600 mb-2 px-4">{selectedPlant.family}</div>
              <a
                href={`/botany/${selectedPlant._id}`}
                className="text-green-700 underline text-sm hover:text-green-900 px-4 pb-4 inline-block"
                target="_blank"
                rel="noopener noreferrer"
              >
                View Details
              </a>
            </div>
          </OverlayView>
        )}
        {/* DrawingManager for area selection */}
        {selectArea && !areaBounds && (
          <>
            <button
              onClick={() => {
                setDrawingMode(window.google?.maps?.drawing?.OverlayType.RECTANGLE || 'rectangle');
                setDrawAreaActive(true);
              }}
              className={`absolute top-4 left-1/2 transform -translate-x-1/2 bg-green-700 text-white px-6 py-2 rounded shadow-lg z-20 hover:bg-green-800 ${drawAreaActive ? 'ring-4 ring-green-400' : ''}`}
            >
              Draw Area
            </button>
            <DrawingManager
              drawingMode={drawingMode}
              onRectangleComplete={rect => {
                // Remove all previous rectangles (single-box mode)
                allDrawnRectangles.current.forEach(r => r.setMap(null));
                allDrawnRectangles.current = [rect];
                setDrawnRectangle(rect);
                rectangleRef.current = rect;
                setRectangleActive(true);
                setDrawingMode(null);
                // Save bounds
                const bounds = rect.getBounds();
                if (!bounds) return;
                const ne = bounds.getNorthEast();
                const sw = bounds.getSouthWest();
                setAreaBounds({
                  north: ne.lat(),
                  south: sw.lat(),
                  east: ne.lng(),
                  west: sw.lng(),
                });
                setHasSearched(true);
              }}
              options={{
                drawingControl: false,
                rectangleOptions: {
                  draggable: true,
                  editable: true,
                  strokeColor: '#000',
                  fillColor: '#000',
                  fillOpacity: 0,
                  strokeOpacity: 1.0,
                  strokeWeight: 3,
                },
              }}
            />
          </>
        )}
        {/* (Do not render any <Rectangle /> React component) */}
      </GoogleMap>
      {/* Remove Area button */}
      {selectArea && areaBounds && rectangleActive && (
        <button
          onClick={handleRemoveArea}
          className="absolute top-4 right-4 bg-red-600 text-white px-4 py-2 rounded shadow-lg z-20 hover:bg-red-700"
        >
          Remove Area
        </button>
      )}
    </div>
  );
}

export default function Botany() {
  const searchParams = useSearchParams();

  const [searchMode, setSearchMode] = useState<'basic' | 'advanced'>('basic');
  const [basicSearchQuery, setBasicSearchQuery] = useState('');
  const [basicSearchType, setBasicSearchType] = useState<'exact' | 'match_either'>('exact');

  const [searchRules, setSearchRules] = useState<LocalSearchRule[]>([
    { id: 1, index: "scientificName", value: "" },
  ]);
  const [sort, setSort] = useState<Sort>({
    field: "",
    direction: "asc",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // New filter checkboxes
  const [hasValidImage, setHasValidImage] = useState(false);
  const [hasValidGeoCoords, setHasValidGeoCoords] = useState(false);
  const [hasMapView, setHasMapView] = useState(false);
  const [selectArea, setSelectArea] = useState(false);
  const [areaBounds, setAreaBounds] = useState<google.maps.LatLngBoundsLiteral | null>(null);

  // In Botany component, add these refs and state:
  const rectangleRef = useRef<google.maps.Rectangle | null>(null);
  const [rectangleActive, setRectangleActive] = useState(false);
  const [drawingMode, setDrawingMode] = useState<google.maps.drawing.OverlayType | null>(null);

  const RESULTS_PER_PAGE = 30;
  const [currentPage, setCurrentPage] = useState(1);

  // Move getBasicSearchRules to the top of the component
  const getBasicSearchRules = () => {
    if (!basicSearchQuery.trim()) return [];
    const terms = basicSearchQuery.trim().split(',').map((t: string) => t.trim()).filter((term: string) => term.length > 0);
    if (terms.length === 0) return [];
    if (basicSearchType === 'exact') {
      return [{
        field: "all",
        operator: "basic_exact",
        value: basicSearchQuery.trim()
      }];
    } else {
      return [{
        field: "scientificName",
        operator: "basic_any",
        value: basicSearchQuery.trim()
      }];
    }
  };

  // Add area filter to search rules if area is selected
  const latMin = areaBounds ? Math.min(areaBounds.south, areaBounds.north) : undefined;
  const latMax = areaBounds ? Math.max(areaBounds.south, areaBounds.north) : undefined;
  const lngMin = areaBounds ? Math.min(areaBounds.west, areaBounds.east) : undefined;
  const lngMax = areaBounds ? Math.max(areaBounds.west, areaBounds.east) : undefined;

  const areaFilterRule = (latMin !== undefined && latMax !== undefined && lngMin !== undefined && lngMax !== undefined) ? [
    { field: "latitude1", operator: "between", value: latMin ?? 0, secondValue: latMax ?? 0 },
    { field: "longitude1", operator: "between", value: lngMin ?? 0, secondValue: lngMax ?? 0 }
  ] : [];


  const searchData = useQuery(api.botany.searchPlants, hasSearched && (!selectArea || (selectArea && areaBounds)) ? {
    rules: [
      ...(searchMode === 'basic' ? getBasicSearchRules() : searchRules.map(rule => {
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
          };
        }
        return {
          field: rule.index,
          operator: "=",
          value: rule.value
        };
      })),
      ...(hasValidImage ? [{ field: "img", operator: "has_valid_image", value: "true" }] : []),
      ...((hasValidGeoCoords && !areaBounds) ? [{ field: "latitude1", operator: "has_valid_coords", value: "true" }] : []),
      ...areaFilterRule
    ],
    sort,
    pagination: { pageNumber: currentPage, pageSize: RESULTS_PER_PAGE },
  } : "skip");



  const totalData = useQuery(api.botany.getTotal, hasSearched ? {
    rules: [
      ...(searchMode === 'basic' ? getBasicSearchRules() : searchRules.map(rule => {
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
          };
        }
        return {
          field: rule.index,
          operator: "=",
          value: rule.value
        };
      })),
      // Add image filter if checked
      ...(hasValidImage ? [{ field: "img", operator: "has_valid_image", value: "true" }] : []),
      // Add geocoordinates filter if checked
      ...((hasValidGeoCoords && !areaBounds) ? [{ field: "latitude1", operator: "has_valid_coords", value: "true" }] : []),
      ...areaFilterRule
    ],
  } : "skip");

  const totalResults = totalData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalResults / RESULTS_PER_PAGE));

  const handleSearch = useCallback(async () => {
    setIsLoading(true);
    setHasSearched(true);
    // Reset pagination to first page when searching
    setCurrentPage(1);
    // Reset loading state after a short delay to allow for the query to start
    setTimeout(() => setIsLoading(false), 1000);
  }, []); // Empty dependency array since this function doesn't depend on any values

  // Handle URL search params
  useEffect(() => {
    const query = searchParams.get("query");
    if (query) {
      try {
        const parsed = JSON.parse(decodeURIComponent(query));
        setSearchRules(parsed);
        // Reset sort to unsorted for new queries
        setSort({ field: "", direction: "asc" });
        // Reset pagination to first page for new queries
        setCurrentPage(1);
        setHasSearched(true);
        handleSearch();
      } catch {
        handleSearch();
      }
    }
  }, [searchParams, handleSearch]);

  const handleRuleChange = (id: number, key: string, newValue: string) => {
    setSearchRules((rules) =>
      rules.map((rule) => {
        if (rule.id === id) {
          // This handler is for changing the field type
          if (key === "index") {
            const isNumeric = numericFields.includes(newValue);
            return {
              ...rule,
              index: newValue,
              value: "", // Reset legacy value field
              numericFilter: isNumeric
                ? { type: "=", value: "" }
                : undefined,
              textFilter: !isNumeric
                ? { type: "contains", value: "" }
                : undefined,
            };
          }
        }
        return rule;
      })
    );
    // Reset search state when rules change
    setHasSearched(false);
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
    // Reset search state when filters change
    setHasSearched(false);
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
    // Reset search state when filters change
    setHasSearched(false);
  };

  // Add page navigation controls
  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setIsLoading(true);
      setCurrentPage(newPage);
      // Reset loading state after a short delay
      setTimeout(() => setIsLoading(false), 500);
    }
  };

  const startMaterializing = useMutation(api.botany.startMaterializingResults);

  useEffect(() => {
    if (hasSearched) {
      const rulesToSend = [
        ...(searchMode === 'basic' ? getBasicSearchRules() : searchRules.map(rule => {
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
            };
          }
          return {
            field: rule.index,
            operator: "=",
            value: rule.value
          };
        })),
        ...(hasValidImage ? [{ field: "img", operator: "has_valid_image", value: "true" }] : []),
        ...((hasValidGeoCoords && !areaBounds) ? [{ field: "latitude1", operator: "has_valid_coords", value: "true" }] : []),
        ...areaFilterRule
      ];

      startMaterializing({
        rules: rulesToSend,
        sort,
      });
    }
  }, [hasSearched, searchMode, basicSearchQuery, basicSearchType, JSON.stringify(searchRules), JSON.stringify(sort), hasValidImage, hasValidGeoCoords]);



  // REMOVE the useEffect that triggers setHasSearched(true) on [areaBounds, selectArea]

  const render = () => {
    return (
      <>

        <div className="w-full min-h-screen bg-gradient-to-b from-white to-gray-50/50">
          <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {renderSearch()}
            {(hasMapView || selectArea) && (
              <MapView
                plants={searchData?.page || []}
                selectArea={selectArea}
                areaBounds={areaBounds}
                setAreaBounds={setAreaBounds}
                handleRectangleComplete={handleRectangleComplete}
                rectangleRef={rectangleRef}
                rectangleActive={rectangleActive}
                setRectangleActive={setRectangleActive}
                drawingMode={drawingMode}
                setDrawingMode={setDrawingMode}
                setHasSearched={setHasSearched}
              />
            )}

            {renderSearchResults()}
          </div>
        </div>
      </>
    );
  };

  const renderSearch = () => {
    const renderSearchModeToggle = () => {
      return (
        <div className="flex justify-center mb-6">
          <div className="bg-gray-100 rounded-lg p-1 flex">
            <button
              onClick={() => {
                setSearchMode('basic');
                setHasSearched(false);
              }}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                searchMode === 'basic'
                  ? 'bg-white text-green-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Basic Search
            </button>
            <button
              onClick={() => {
                setSearchMode('advanced');
                setHasSearched(false);
              }}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                searchMode === 'advanced'
                  ? 'bg-white text-green-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Advanced Search
            </button>
          </div>
        </div>
      );
    };

    const renderBasicSearch = () => {
      return (
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="flex gap-3 items-center">
            <Input
              type="text"
              value={basicSearchQuery}
              onChange={(e) => {
                setBasicSearchQuery(e.target.value);
                setHasSearched(false);
              }}
              placeholder="Enter value(s), separated by commas"
              className="flex-1"
            />
            <div className="relative group">
              <select
                value={basicSearchType}
                onChange={(e) => {
                  setBasicSearchType(e.target.value as 'exact' | 'match_either');
                  setHasSearched(false);
                }}
                className="px-3 py-2 rounded-lg border border-green-300 bg-white text-sm"
              >
                <option value="exact">Exact Match</option>
                <option value="match_either">Match Any</option>
              </select>
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
                {basicSearchType === 'exact' 
                  ? 'All terms must be found in the same record'
                  : 'At least one term must be found in the same record'
                }
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>
              </div>
            </div>
            <Button 
              onClick={handleSearch}
              disabled={isLoading || !basicSearchQuery.trim()}
              className={`min-w-[100px] transition-all duration-200 ${
                isLoading 
                  ? 'scale-95 bg-green-600' 
                  : 'hover:scale-105 active:scale-95 bg-green-700 hover:bg-green-600'
              }`}
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <LoadingSpinner size="sm" text="" />
                  <span>Searching...</span>
                </div>
              ) : (
                "Search"
              )}
            </Button>
          </div>
          
          {/* Filter Checkboxes */}
          <div className="flex items-center gap-6 justify-center pt-4 border-t border-gray-200">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-600 group relative">
              <input
                type="checkbox"
                checked={hasValidImage}
                onChange={(e) => {
                  setHasValidImage(e.target.checked);
                  setHasSearched(false);
                }}
                className="rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <span>Has Valid Image</span>
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
                  Only show plants with image attachments (UUID-based images)
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>
                </div>
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-600 group relative">
              <input
                type="checkbox"
                checked={hasValidGeoCoords}
                onChange={(e) => {
                  setHasValidGeoCoords(e.target.checked);
                  setHasSearched(false);
                }}
                className="rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <span>Has Geo Coordinates</span>
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
                Only show plants with valid latitude and longitude coordinates
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>
              </div>
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-600 group relative">
              <input
                type="checkbox"
                checked={hasMapView}
                onChange={(e) => {
                  setHasMapView(e.target.checked);
                  // If enabling Map View, also enable Has Geo Coordinates
                  if (e.target.checked && !hasValidGeoCoords) {
                    setHasValidGeoCoords(true);
                  }
                }}
                className="rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <span>Map View</span>
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
                Show results on the map (UI only)
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>
              </div>
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-600 group relative">
              <input
                type="checkbox"
                checked={selectArea}
                onChange={(e) => {
                  setSelectArea(e.target.checked);
                  setAreaBounds(null);
                  setHasSearched(false);
                  // If enabling Select Area, also enable Map View and Has Geo Coordinates
                  if (e.target.checked) {
                    setHasMapView(true);
                    setHasValidGeoCoords(true);
                    // If areaBounds already exists, trigger search
                    if (areaBounds) {
                      setHasSearched(true);
                    }
                  }
                }}
                className="rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <span>Select Area</span>
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
                  Draw a rectangle on the map to filter results by area
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>
                </div>
            </label>
          </div>
        </div>
      );
    };

    const renderAdvancedSearch = () => {
      const addSearchRule = () => {
        setSearchRules((rules) => [
          ...rules,
          { id: Date.now(), index: "scientificName", value: "" },
        ]);
        // Reset search state when adding new rules
        setHasSearched(false);
      };

      const removeSearchRule = (id: number) => {
        setSearchRules((rules) => rules.filter((rule) => rule.id !== id));
        // Reset search state when removing rules
        setHasSearched(false);
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

              {/* Show numeric filter options for numeric fields */}
              {numericFields.includes(rule.index) && (
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
                              rule.index === "endDateMonth" ? "End Month (1-21)" :
                              rule.index === "endDateDay" ? "End Day (1-31)" :
                              rule.index === "endDateYear" ? "End Year" :
                              rule.index === "barCode" ? "Barcode" :
                              rule.index === "accessionNumber" ? "Accession #" :
                              "Value"}
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
              {!numericFields.includes(rule.index) && (
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
            
            <Button 
              onClick={handleSearch}
              disabled={isLoading}
              className={`min-w-[100px] transition-all duration-200 ${
                isLoading 
                  ? 'scale-95 bg-green-600' 
                  : 'hover:scale-105 active:scale-95 bg-green-700 hover:bg-green-600'
              }`}
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <LoadingSpinner size="sm" text="" />
                  <span>Searching...</span>
                </div>
              ) : (
                "Search"
              )}
            </Button>
          </div>
          {/* Filter Checkboxes for Advanced Search */}
          <div className="flex items-center gap-6 justify-center pt-4 border-t border-gray-200">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-600 group relative">
              <input
                type="checkbox"
                checked={hasValidImage}
                onChange={(e) => {
                  setHasValidImage(e.target.checked);
                  setHasSearched(false);
                }}
                className="rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <span>Has Valid Image</span>
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
                Only show plants with image attachments (UUID-based images)
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>
              </div>
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-600 group relative">
              <input
                type="checkbox"
                checked={hasValidGeoCoords}
                onChange={(e) => {
                  setHasValidGeoCoords(e.target.checked);
                  setHasSearched(false);
                }}
                className="rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <span>Has Geo Coordinates</span>
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
                Only show plants with valid latitude and longitude coordinates
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>
              </div>
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-600 group relative">
              <input
                type="checkbox"
                checked={hasMapView}
                onChange={(e) => {
                  setHasMapView(e.target.checked);
                  // If enabling Map View, also enable Has Geo Coordinates
                  if (e.target.checked && !hasValidGeoCoords) {
                    setHasValidGeoCoords(true);
                  }
                }}
                className="rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <span>Map View</span>
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
                Show results on the map (UI only)
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>
              </div>
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-600 group relative">
              <input
                type="checkbox"
                checked={selectArea}
                onChange={(e) => {
                  setSelectArea(e.target.checked);
                  setAreaBounds(null);
                  setHasSearched(false);
                  // If enabling Select Area, also enable Map View and Has Geo Coordinates
                  if (e.target.checked) {
                    setHasMapView(true);
                    setHasValidGeoCoords(true);
                    // If areaBounds already exists, trigger search
                    if (areaBounds) {
                      setHasSearched(true);
                    }
                  }
                }}
                className="rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <span>Select Area</span>
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
                  Draw a rectangle on the map to filter results by area
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>
                </div>
            </label>
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

        {renderSearchModeToggle()}

        <div className="max-w-2xl mx-auto mb-8">
          {searchMode === 'basic' ? renderBasicSearch() : renderAdvancedSearch()}
        </div>
      </div>
    );
  };

  const renderSearchResults = () => {
    // Show initial state when no search has been performed
    if (!hasSearched) {
      return (
        <div className="w-full flex justify-center py-16">
          <div className="text-center space-y-4">
            <div className="text-gray-500">
              <p className="text-lg">Ready to search</p>
              <p className="text-sm">
                {searchMode === 'basic' 
                  ? 'Enter search terms and click the Search button to begin'
                  : 'Enter your search criteria and click the Search button to begin'
                }
              </p>
            </div>
          </div>
        </div>
      );
    }

    // If selectArea is enabled but no area is selected, prompt the user
    if (selectArea && !areaBounds) {
      return (
        <div className="w-full flex justify-center py-16">
          <div className="text-center space-y-4">
            <div className="text-gray-500">
              <p className="text-lg">Select an area on the map</p>
              <p className="text-sm">Draw and adjust the rectangle to filter results by area.</p>
            </div>
          </div>
        </div>
      );
    }

    // Show loading state when search data is being fetched or when manually loading
    if (isLoading) {
      return (
        <div className="w-full flex justify-center py-16">
          <LoadingCard text="Searching..." />
        </div>
      );
    }

    // If we have searched but no data yet, show preparing message
    if (hasSearched && !searchData) {
      return (
        <div className="w-full flex justify-center py-16">
          <LoadingCard text="Preparing search results..." />
        </div>
      );
    }

    return (
      <div className="relative">
        {/* Results count and Sorter */}
        {searchData && searchData.page && searchData.page.length > 0 && (
          <div className="mb-6 flex justify-between items-center">
            <div className="text-gray-600">
            Showing{" "}
              <span className="font-medium text-green-700">{searchData.page.length}</span>{" "}
            specimens
              {searchMode === 'basic' && basicSearchQuery && (
                <span className="text-sm text-gray-500 ml-2">
                  for "{basicSearchQuery}" ({basicSearchType === 'exact' ? 'exact match' : 'match any'})
                </span>
              )}
              {(hasValidImage || hasValidGeoCoords) && (
                <span className="text-sm text-blue-600 ml-2">
                  {hasValidImage && hasValidGeoCoords ? " (with image & coordinates filter)" :
                   hasValidImage ? " (with image filter)" :
                   " (with coordinates filter)"}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label htmlFor="sort-by" className="text-sm font-medium text-gray-600">Sort by:</label>
                <select
                  id="sort-by"
                  value={sort.field === "" || sort.field === "-" ? "-asc" : `${sort.field}-${sort.direction}`}
                  onChange={(e) => {
                    const [field, direction] = e.target.value.split('-');
                    setIsLoading(true);
                    setSort({ 
                      field: field === "-" ? "" : field, 
                      direction: direction as 'asc' | 'desc' 
                    });
                    // Reset pagination to first page when sort changes
                    setCurrentPage(1);
                    // Only show brief loading for sorting, don't artificially delay
                    setTimeout(() => setIsLoading(false), 200);
                  }}
                  className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                >
                  <option value="-asc">Unsorted</option>
                  <option value="scientificName-asc">Scientific Name (A-Z)</option>
                  <option value="scientificName-desc">Scientific Name (Z-A)</option>
                  <option value="family-asc">Family (A-Z)</option>
                  <option value="family-desc">Family (Z-A)</option>
                  <option value="order-asc">Order (A-Z)</option>
                  <option value="order-desc">Order (Z-A)</option>
                  <option value="class-asc">Class (A-Z)</option>
                  <option value="class-desc">Class (Z-A)</option>
                  <option value="genus-asc">Genus (A-Z)</option>
                  <option value="genus-desc">Genus (Z-A)</option>
                  <option value="species-asc">Species (A-Z)</option>
                  <option value="species-desc">Species (Z-A)</option>
                  <option value="country-asc">Country (A-Z)</option>
                  <option value="country-desc">Country (Z-A)</option>
                  <option value="state-asc">State (A-Z)</option>
                  <option value="state-desc">State (Z-A)</option>
                  <option value="county-asc">County (A-Z)</option>
                  <option value="county-desc">County (Z-A)</option>
                  <option value="barCode-asc">Barcode (Asc)</option>
                  <option value="barCode-desc">Barcode (Desc)</option>
                  <option value="accessionNumber-asc">Accession # (Asc)</option>
                  <option value="accessionNumber-desc">Accession # (Desc)</option>
                  <option value="longitude1-asc">Longitude (Asc)</option>
                  <option value="longitude1-desc">Longitude (Desc)</option>
                  <option value="latitude1-asc">Latitude (Asc)</option>
                  <option value="latitude1-desc">Latitude (Desc)</option>
                  <option value="minElevation-asc">Min Elevation (Asc)</option>
                  <option value="minElevation-desc">Min Elevation (Desc)</option>
                  <option value="maxElevation-asc">Max Elevation (Asc)</option>
                  <option value="maxElevation-desc">Max Elevation (Desc)</option>
                  <option value="startDateMonth-asc">Start Date Month (Asc)</option>
                  <option value="startDateMonth-desc">Start Date Month (Desc)</option>
                  <option value="startDateDay-asc">Start Date Day (Asc)</option>
                  <option value="startDateDay-desc">Start Date Day (Desc)</option>
                  <option value="startDateYear-asc">Start Date Year (Asc)</option>
                  <option value="startDateYear-desc">Start Date Year (Desc)</option>
                  <option value="endDateMonth-asc">End Date Month (Asc)</option>
                  <option value="endDateMonth-desc">End Date Month (Desc)</option>
                  <option value="endDateDay-asc">End Date Day (Asc)</option>
                  <option value="endDateDay-desc">End Date Day (Desc)</option>
                  <option value="endDateYear-asc">End Date Year (Asc)</option>
                  <option value="endDateYear-desc">End Date Year (Desc)</option>
                  <option value="collectors-asc">Collectors (A-Z)</option>
                  <option value="collectors-desc">Collectors (Z-A)</option>
                  <option value="continent-asc">Continent (A-Z)</option>
                  <option value="continent-desc">Continent (Z-A)</option>
                  <option value="determinedDate-asc">Determined Date (A-Z)</option>
                  <option value="determinedDate-desc">Determined Date (Z-A)</option>
                  <option value="determiner-asc">Determiner (A-Z)</option>
                  <option value="determiner-desc">Determiner (Z-A)</option>
                  <option value="habitat-asc">Habitat (A-Z)</option>
                  <option value="habitat-desc">Habitat (Z-A)</option>
                  <option value="herbarium-asc">Herbarium (A-Z)</option>
                  <option value="herbarium-desc">Herbarium (Z-A)</option>
                  <option value="localityName-asc">Locality (A-Z)</option>
                  <option value="localityName-desc">Locality (Z-A)</option>
                  <option value="phenology-asc">Phenology (A-Z)</option>
                  <option value="phenology-desc">Phenology (Z-A)</option>
                  <option value="preparations-asc">Preparations (A-Z)</option>
                  <option value="preparations-desc">Preparations (Z-A)</option>
                  <option value="town-asc">Town (A-Z)</option>
                  <option value="town-desc">Town (Z-A)</option>
                  <option value="typeStatusName-asc">Type Status (A-Z)</option>
                  <option value="typeStatusName-desc">Type Status (Z-A)</option>
                  <option value="verbatimDate-asc">Verbatim Date (A-Z)</option>
                  <option value="verbatimDate-desc">Verbatim Date (Z-A)</option>
                  <option value="timestampModified-asc">Last Modified (A-Z)</option>
                  <option value="timestampModified-desc">Last Modified (Z-A)</option>
                  <option value="originalElevationUnit-asc">Elevation Unit (A-Z)</option>
                  <option value="originalElevationUnit-desc">Elevation Unit (Z-A)</option>
                  <option value="collectorNumber-asc">Collector Number (A-Z)</option>
                  <option value="collectorNumber-desc">Collector Number (Z-A)</option>
                  <option value="localityContinued-asc">Locality Continued (A-Z)</option>
                  <option value="localityContinued-desc">Locality Continued (Z-A)</option>
                  <option value="redactLocalityCo-asc">Redact Locality Co (A-Z)</option>
                  <option value="redactLocalityCo-desc">Redact Locality Co (Z-A)</option>
                  <option value="redactLocalityTaxon-asc">Redact Locality Taxon (A-Z)</option>
                  <option value="redactLocalityTaxon-desc">Redact Locality Taxon (Z-A)</option>
                  <option value="redactLocalityAcceptedTaxon-asc">Redact Locality Accepted Taxon (A-Z)</option>
                  <option value="redactLocalityAcceptedTaxon-desc">Redact Locality Accepted Taxon (Z-A)</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span>
                  Page
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    value={currentPage}
                    onChange={e => {
                      let page = Number(e.target.value);
                      if (isNaN(page) || page < 1) page = 1;
                      if (page > totalPages) page = totalPages;
                      handlePageChange(page);
                    }}
                    className="w-16 mx-1 text-center border rounded"
                  />
                  of {totalPages}
                </span>
                <Button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages}>{'>'}</Button>
                <Button onClick={() => handlePageChange(totalPages)} disabled={currentPage === totalPages}>{'>>'}</Button>
                <Button onClick={() => handlePageChange(1)} disabled={currentPage === 1}>{'<<'}</Button>
                <Button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1}>{'<'}</Button>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6 auto-rows-fr">
          {!searchData?.page || searchData.page.length === 0 ? (
            <div className="col-span-full text-center py-16">
              <div className="text-gray-500 space-y-2">
                <p className="text-lg">No results found.</p>
                <p className="text-sm">
                  {searchMode === 'basic' && basicSearchQuery
                    ? `No specimens found for "${basicSearchQuery}" (${basicSearchType === 'exact' ? 'exact match' : 'match any'}). Try different terms or switch to advanced search.`
                    : 'Try adjusting your search terms or filters.'
                  }
                </p>
              </div>
            </div>
          ) : (
            <>
              {searchData.page.map((plant: any) => (
                <BotanyCard 
                  key={plant._id} 
                  plant={plant} 
                />
              ))}
              <div className="col-span-full flex justify-center items-center gap-2 mt-8">
                <Button onClick={() => handlePageChange(1)} disabled={currentPage === 1}>{'<<'}</Button>
                <Button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1}>{'<'}</Button>
                <span>
                  Page
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    value={currentPage}
                    onChange={e => {
                      let page = Number(e.target.value);
                      if (isNaN(page) || page < 1) page = 1;
                      if (page > totalPages) page = totalPages;
                      handlePageChange(page);
                    }}
                    className="w-16 mx-1 text-center border rounded"
                  />
                  of {totalPages}
                </span>
                <Button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages}>{'>'}</Button>
                <Button onClick={() => handlePageChange(totalPages)} disabled={currentPage === totalPages}>{'>>'}</Button>
                <span className="ml-4 text-gray-600">
                  Displaying records {(currentPage - 1) * RESULTS_PER_PAGE + 1}
                  -
                  {Math.min(currentPage * RESULTS_PER_PAGE, totalResults)}
                  {' '}of {totalResults}
                </span>
                </div>
            </>
          )}
        </div>
      </div>
    );
  };

  // In Botany component, define handleRectangleComplete so it has access to setHasSearched
  const handleRectangleComplete = (rectangle: google.maps.Rectangle) => {
    if (rectangleRef.current) {
      rectangleRef.current.setMap(null);
      rectangleRef.current = null;
    }
    rectangleRef.current = rectangle;
    setRectangleActive(true);
    setDrawingMode(null); // Disable further drawing
    // Save bounds
    const bounds = rectangle.getBounds();
    if (!bounds) return;
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    setAreaBounds({
      north: ne.lat(),
      south: sw.lat(),
      east: ne.lng(),
      west: sw.lng(),
    });
    setHasSearched(true);
  };

  return render();
}
