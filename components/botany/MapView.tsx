"use client";
import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Rectangle, FeatureGroup, Tooltip } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import { extractImageUrl } from '@/lib/utils';
import { createPortal } from 'react-dom';
import { useMap } from 'react-leaflet';
import { Button } from '@/components/ui/button';

// Define the MapViewProps type
export type MapViewProps = {
  plants: any[],
  selectArea: boolean,
  areaBounds: [[number, number], [number, number]] | null,
  setAreaBounds: (b: [[number, number], [number, number]] | null) => void,
  rectangleRef: React.MutableRefObject<L.Rectangle | null>,
  rectangleActive: boolean,
  setRectangleActive: React.Dispatch<React.SetStateAction<boolean>>,
  setHasSearched: React.Dispatch<React.SetStateAction<boolean>>,
};

// Add DrawAreaControl component inside MapView
function DrawAreaControl({ areaBounds, onRemoveArea }: { areaBounds: [[number, number], [number, number]] | null, onRemoveArea: () => void }) {
  const map = useMap();
  const handleDrawArea = () => {
    const drawControl = new L.Draw.Rectangle(map as any, {
      shapeOptions: { color: '#000', weight: 3, fillOpacity: 0 }
    });
    drawControl.enable();
  };
  if (!areaBounds) {
    return (
      <button
        className="absolute top-4 right-4 z-[1000] bg-green-700 text-white px-4 py-2 rounded shadow hover:bg-green-800 transition"
        onClick={handleDrawArea}
      >
        Draw Area
      </button>
    );
  }
  // Show Remove Area button when areaBounds is set
  return (
    <button
      className="absolute top-4 right-4 z-[1000] bg-red-600 text-white px-4 py-2 rounded shadow hover:bg-red-700 transition flex items-center gap-2"
      onClick={onRemoveArea}
      title="Remove Area"
    >
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
      Remove Area
    </button>
  );
}

export default function MapView({ plants, selectArea, areaBounds, setAreaBounds, rectangleRef, rectangleActive, setRectangleActive, setHasSearched }: MapViewProps) {
  useEffect(() => {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
      iconUrl: require('leaflet/dist/images/marker-icon.png'),
      shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
    });
  }, []);

  const [mapCenter, setMapCenter] = useState<[number, number]>([20, 0]);
  const [mapZoom, setMapZoom] = useState(3);
  const [selectedPlant, setSelectedPlant] = useState<any | null>(null);
  const featureGroupRef = useRef<any>(null);
  const PLACEHOLDER_IMAGE = "/cal_academy.png";
  const mapRef = useRef<any>(null);
  const [mapInstance, setMapInstance] = useState<any>(null);
  useEffect(() => {
    if (mapRef.current && mapRef.current._leaflet_id && !mapInstance) {
      setMapInstance(mapRef.current);
    }
  }, [mapRef.current]);

  // Markers
  const markers = (plants as any[]).filter((p: any) =>
    typeof p.latitude1 === 'number' && typeof p.longitude1 === 'number' &&
    !isNaN(p.latitude1) && !isNaN(p.longitude1)
  );

  // Add custom green pin SVG icon
  const greenPin = L.icon({
    iconUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="48" viewBox="0 0 32 48"><path fill="%2334d399" stroke="%23000" stroke-width="2" d="M16 2C8.268 2 2 8.268 2 16c0 9.941 12.09 27.09 13.01 28.41a2 2 0 0 0 3.98 0C17.91 43.09 30 25.941 30 16c0-7.732-6.268-14-14-14zm0 20a6 6 0 1 1 0-12 6 6 0 0 1 0 12z"/></svg>',
    iconSize: [32, 48],
    iconAnchor: [16, 48],
    popupAnchor: [0, -48],
    tooltipAnchor: [0, -40],
    shadowUrl: undefined,
  });

  // Handle rectangle creation
  const onCreated = (e: any) => {
    if (e.layerType === 'rectangle') {
      const bounds = e.layer.getBounds();
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      setAreaBounds([
        [sw.lat, sw.lng],
        [ne.lat, ne.lng],
      ]);
      setRectangleActive(true);
      setHasSearched(true);
    }
  };

  // Handle rectangle removal
  const onDeleted = () => {
    setAreaBounds(null);
    setRectangleActive(false);
    setHasSearched(false);
  };

  // Remove all areas handler
  const handleRemoveArea = () => {
    setAreaBounds(null);
    setRectangleActive(false);
    // Remove rectangles from map if needed
    if (rectangleRef.current) {
      rectangleRef.current.remove();
    }
    // Optionally, clear all rectangles from FeatureGroup
    if (featureGroupRef.current) {
      featureGroupRef.current.clearLayers();
    }
  };

  return (
    <div className={`w-full h-[500px] my-8 rounded-lg overflow-hidden border relative`}>
      <MapContainer
        center={mapCenter}
        zoom={mapZoom}
        style={{ width: '100%', height: '100%' }}
        ref={mapRef}
      >
        {/* Draw Area or Remove Area button inside MapContainer for context */}
        {selectArea && <DrawAreaControl areaBounds={areaBounds} onRemoveArea={handleRemoveArea} />}
        <TileLayer
          attribution='&copy; <a href="https://carto.com/attributions">CARTO</a> | &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />
        <FeatureGroup ref={featureGroupRef}>
          <EditControl
            position="topright"
            onCreated={onCreated}
            onDeleted={onDeleted}
            draw={{
              rectangle: false, // Always hide default rectangle button
              polyline: false,
              polygon: false,
              circle: false,
              marker: false,
              circlemarker: false,
            }}
            edit={{
              edit: false,
              remove: selectArea && areaBounds,
            }}
          />
          {/* Rectangle is drawn if areaBounds is set */}
          {areaBounds && <Rectangle bounds={areaBounds} pathOptions={{ color: '#000', weight: 3, fillOpacity: 0 }} />}
        </FeatureGroup>
        {markers.map((plant: any, i: number) => (
          <Marker
            key={plant._id || i}
            position={[plant.latitude1, plant.longitude1]}
            icon={greenPin}
            eventHandlers={{
              click: () => setSelectedPlant(plant),
            }}
          >
            <Tooltip direction="top" offset={[0, -30]}>{plant.scientificName}</Tooltip>
            {selectedPlant && selectedPlant._id === plant._id && (
              <Popup
                position={[plant.latitude1, plant.longitude1]}
                eventHandlers={{ remove: () => setSelectedPlant(null) }}
              >
                <div className="w-80 p-0 bg-white" style={{margin: 0, border: 'none', borderRadius: 0, boxShadow: 'none'}}>
                  <div className="relative" style={{padding: 0, margin: 0}}>
                    <img
                      src={extractImageUrl(selectedPlant.img, '500') || PLACEHOLDER_IMAGE}
                      alt={selectedPlant.scientificName}
                      className="object-cover"
                      style={{ width: '100%', height: 'auto', aspectRatio: '4/3', display: 'block', margin: 0, padding: 0, borderRadius: 0 }}
                    />
                  </div>
                  <div style={{marginTop: 0, paddingTop: 16, borderRadius: 0, boxShadow: 'none', border: 'none', background: 'white'}}>
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
                </div>
              </Popup>
            )}
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
} 