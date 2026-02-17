// OpenAPI Spec Generator using next-swagger-doc

import { createSwaggerSpec } from 'next-swagger-doc';

export const getApiDocs = async () => {
  const spec = createSwaggerSpec({
    apiFolder: 'app/api',
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'Inkarr API',
        version: '0.1.0',
        description: 'API documentation for Inkarr - a media manager for comics and manga',
        contact: {
          name: 'Inkarr',
        },
      },
      servers: [
        {
          url: '/',
          description: 'Current server',
        },
      ],
      tags: [
        { name: 'Series', description: 'Series management' },
        { name: 'Volumes', description: 'Volume management' },
        { name: 'System', description: 'System operations' },
        { name: 'Config', description: 'Configuration management' },
        { name: 'Download Clients', description: 'Download client management' },
        { name: 'Indexers', description: 'Indexer management' },
        { name: 'Search', description: 'Search operations' },
        { name: 'Import', description: 'Import operations' },
        { name: 'Auth', description: 'Authentication' },
      ],
      components: {
        securitySchemes: {
          ApiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'X-Api-Key',
            description: 'API key for authentication',
          },
        },
        schemas: {
          Series: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              title: { type: 'string' },
              sortTitle: { type: 'string' },
              status: { type: 'string' },
              overview: { type: 'string' },
              year: { type: 'integer' },
              path: { type: 'string' },
              monitored: { type: 'boolean' },
              images: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    coverType: { type: 'string' },
                    url: { type: 'string' },
                  },
                },
              },
            },
          },
          Volume: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              seriesId: { type: 'integer' },
              volumeNumber: { type: 'number' },
              title: { type: 'string' },
              monitored: { type: 'boolean' },
              hasFile: { type: 'boolean' },
            },
          },
          Config: {
            type: 'object',
            properties: {
              key: { type: 'string' },
              value: { type: 'string' },
            },
          },
          Error: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
      security: [{ ApiKeyAuth: [] }],
    },
  });
  return spec;
};
