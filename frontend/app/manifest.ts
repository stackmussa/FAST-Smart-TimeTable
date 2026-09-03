import { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  const isProd = process.env.NODE_ENV === 'production';
  const repoName = 'FAST-Smart-TimeTable';
  const basePath = isProd ? `/${repoName}` : '';

  return {
    name: 'FAST Smart TimeTable',
    short_name: 'TimeTable',
    description: 'Smart Schedule Viewer & Directory for FAST-NUCES Islamabad',
    start_url: `${basePath}/`,
    display: 'standalone',
    background_color: '#0f172a',
    theme_color: '#0f172a',
    icons: [
      {
        src: `${basePath}/icon-192x192.png`,
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: `${basePath}/icon-512x512.png`,
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
