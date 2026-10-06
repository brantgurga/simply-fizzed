// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

export const brand = {
  name: "Simply Fizzed",
  shortName: "SimFiz",
  description: "Find sodas and the places that serve them.",
  sourceUrl: "https://github.com/brantgurga/simply-fizzed",
  issuesUrl: "https://github.com/brantgurga/simply-fizzed/issues",
  licenseUrl: "https://github.com/brantgurga/simply-fizzed/blob/main/LICENSE",
  favicon: "/favicon.svg",
  appleTouchIcon: "/icon-192.png",
  icons: [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
    { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
  screenshots: [
    {
      src: "/screenshot-wide.png",
      sizes: "1280x768",
      type: "image/png",
      formFactor: "wide",
      label: "Simply Fizzed desktop search",
    },
    {
      src: "/screenshot-narrow.png",
      sizes: "750x750",
      type: "image/png",
      formFactor: "narrow",
      label: "Simply Fizzed mobile search",
    },
  ],
} as const;
