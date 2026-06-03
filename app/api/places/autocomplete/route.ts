import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Proxy for Google Places (New) Autocomplete API. Keeps the API key
// server-side. Returns the lightweight suggestion list; consumers call
// /api/places/details to resolve a placeId to lat/lng.
//
// Returns 503 (not 500) when the key is missing so the UI can degrade
// to its existing manual-coord flows without a console error.
export async function POST(req: NextRequest) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "places api not configured", code: "no_key" }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const input = body && typeof body.input === "string" ? body.input.trim() : "";
  if (!input) {
    return NextResponse.json({ suggestions: [] });
  }

  // Bias to the configured NoMans pin so suggestions favor Oak Bluffs /
  // MV addresses. Falls back to the default if settings haven't been
  // saved yet.
  const settings = await getSettings();
  const bias = settings.nomans;

  const placesRes = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
    },
    body: JSON.stringify({
      input,
      locationBias: {
        circle: {
          center: { latitude: bias.lat, longitude: bias.lng },
          radius: 8000, // 8km — covers Oak Bluffs, Edgartown, VH, neighboring towns
        },
      },
      // No includedPrimaryTypes filter on purpose: we want the full natural
      // result set so guests can type a landmark/business ("Tony's Market",
      // "Jim's package store") OR a street address and have it resolve.
      // Restricting to a type collection makes establishments rank poorly /
      // drop out for a wide bias radius.
    }),
  });

  if (!placesRes.ok) {
    const text = await placesRes.text().catch(() => "");
    return NextResponse.json(
      { error: "places upstream failed", status: placesRes.status, detail: text.slice(0, 200) },
      { status: 502 },
    );
  }

  const data = (await placesRes.json()) as {
    suggestions?: {
      placePrediction?: {
        placeId?: string;
        text?: { text?: string };
        structuredFormat?: {
          mainText?: { text?: string };
          secondaryText?: { text?: string };
        };
      };
    }[];
  };

  const suggestions = (data.suggestions ?? [])
    .map((s) => {
      const p = s.placePrediction;
      if (!p?.placeId) return null;
      const mainText = p.structuredFormat?.mainText?.text ?? p.text?.text ?? "";
      const secondaryText = p.structuredFormat?.secondaryText?.text ?? "";
      return { placeId: p.placeId, mainText, secondaryText };
    })
    .filter((s): s is { placeId: string; mainText: string; secondaryText: string } => s !== null);

  return NextResponse.json({ suggestions });
}
