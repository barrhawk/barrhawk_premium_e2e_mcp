import axios from 'axios';

export interface GraphQlOptions {
  url: string;
  query: string;
  variables?: Record<string, any>;
  headers?: Record<string, string>;
  auth?: string; // Bearer token
}

/**
 * Execute a GraphQL Query or Mutation
 */
export async function graphql_query(options: GraphQlOptions): Promise<{ data?: any; errors?: any[]; duration: number }> {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (options.auth) {
    headers['Authorization'] = `Bearer ${options.auth}`;
  }

  const startTime = Date.now();

  try {
    const response = await axios.post(options.url, {
      query: options.query,
      variables: options.variables,
    }, { headers });

    return {
      data: response.data.data,
      errors: response.data.errors,
      duration: Date.now() - startTime,
    };
  } catch (error: any) {
    if (error.response) {
      return {
        data: error.response.data.data,
        errors: error.response.data.errors || [error.message],
        duration: Date.now() - startTime,
      };
    }
    throw error;
  }
}

/**
 * Introspect the GraphQL Schema to validation or discovery
 */
export async function graphql_introspect(url: string, auth?: string): Promise<{ types: string[] }> {
  const introspectionQuery = `
    query {
      __schema {
        types {
          name
          kind
        }
      }
    }
  `;

  const result = await graphql_query({ url, query: introspectionQuery, auth });
  
  if (result.errors) {
    throw new Error(`Introspection failed: ${JSON.stringify(result.errors)}`);
  }

  return {
    types: result.data.__schema.types.map((t: any) => t.name),
  };
}
