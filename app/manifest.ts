import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Life OS",
    short_name: "Life OS",
    description: "Antoine's personal life operating system.",
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#6366f1",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    // GTD's capture must be ubiquitous — this lets Android/Chrome's native
    // "Share" sheet send a link/selection from any app straight into the
    // Inbox, once Life OS is installed as a PWA. iOS Safari doesn't support
    // the Web Share Target API, so this only helps on Android for now.
    share_target: {
      action: "/share-capture",
      method: "GET",
      params: {
        title: "title",
        text: "text",
        url: "url",
      },
    },
  };
}
