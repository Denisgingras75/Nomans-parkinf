import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Resolve a Google Places placeId to a usable {lat, lng, label}. Called
// after the user picks a suggestion from /api/places/autocomplete.
export async function GET(req: NextRequest) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "places api not configured", code: "no_key" }, { status: 503 });
  }

  const placeId = new URL(req.url).searchParams.get("placeId");
  if (!placeId) {
    return NextResponse.json({ error: "placeId required" }, { status: 400 });
  }

  const placesRes = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    {
      method: "GET",
      headers: {
        "X-Goog-Api-Key": apiKey,
        // Essentials-tier fields only — keeps per-call cost down.
        "X-Goog-FieldMask": "location,displayName,formattedAddress",
      },
    },
  );

  if (!placesRes.ok) {
    const text = await placesRes.text().catch(() => "");
    return NextResponse.json(
      { error: "places upstream failed", status: placesRes.status, detail: text.slice(0, 200) },
      { status: 502 },
    );
  }

  const data = (await placesRes.json()) as {
    location?: { latitude?: number; longitude?: number };
    displayName?: { text?: string };
    formattedAddress?: string;
  };

  const lat = Number(data.location?.latitude);
  const lng = Number(data.location?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "no coordinates in place details" }, { status: 502 });
  }

  return NextResponse.json({
    lat,
    lng,
    displayName: data.displayName?.text ?? "",
    formattedAddress: data.formattedAddress ?? "",
  });
}
