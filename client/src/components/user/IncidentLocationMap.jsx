import { MapContainer, Marker, Popup, TileLayer, useMapEvents } from "react-leaflet";
import L from "leaflet";

// Fix marker icon issue
delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function MapClickHandler({ onSelectLocation }) {
  useMapEvents({
    click(event) {
      onSelectLocation?.({
        lat: event.latlng.lat,
        lng: event.latlng.lng,
      });
    },
  });

  return null;
}

export default function IncidentLocationMap({ location, onSelectLocation }) {
  const hasLocation =
    location &&
    typeof location.lat === "number" &&
    typeof location.lng === "number";

  const center = hasLocation ? [location.lat, location.lng] : [20.5937, 78.9629];
  const zoom = hasLocation ? 15 : 5;

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      style={{ height: "320px", width: "100%", borderRadius: "20px" }}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <MapClickHandler onSelectLocation={onSelectLocation} />

      {hasLocation ? (
        <Marker position={[location.lat, location.lng]}>
          <Popup>{location.label || "Incident Location"}</Popup>
        </Marker>
      ) : null}
    </MapContainer>
  );
}
