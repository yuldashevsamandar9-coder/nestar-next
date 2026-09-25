import { useMemo } from 'react';
import { ApolloClient, ApolloLink, InMemoryCache, split, from, NormalizedCacheObject } from '@apollo/client';
import createUploadLink from 'apollo-upload-client/public/createUploadLink.js';
import { WebSocketLink } from '@apollo/client/link/ws';
import { getMainDefinition } from '@apollo/client/utilities';
import { onError } from '@apollo/client/link/error';
import { getJwtToken } from '../libs/auth';

let apolloClient: ApolloClient<NormalizedCacheObject>;

function getHeaders() {
	const headers = {} as Record<string, string>;
	const token = getJwtToken();
	if (token) {
		headers['Authorization'] = `Bearer ${token}`;
	}
	return headers;
}

function createIsomorphicLink() {
	if (typeof window !== 'undefined') {
		// 1. Auth Link (Har bir HTTP so'roviga Bearer Token qo'shadi)
		const authLink = new ApolloLink((operation, forward) => {
			operation.setContext(({ headers = {} }) => ({
				headers: {
					...headers,
					...getHeaders(),
				},
			}));
			return forward(operation);
		});

		// 2. Upload Link (Fayllar va mutationlar uchun)
		// @ts-ignore
		const httpLink = new createUploadLink({
			uri: process.env.REACT_APP_API_GRAPHQL_URL || 'http://localhost:3007/graphql',
		});

		// 3. WebSocket Link (Subscriptionlar uchun)
		const wsLink = new WebSocketLink({
			uri: process.env.REACT_APP_API_WS ?? 'ws://localhost:3007/graphql',
			options: {
				reconnect: true,
				timeout: 30000,
				connectionParams: () => ({
					...getHeaders(),
				}),
			},
		});

		// 4. Error Link (Xatoliklarni tutib olish)
		const errorLink = onError(({ graphQLErrors, networkError, response }) => {
			if (graphQLErrors) {
				graphQLErrors.map(({ message, locations, path, extensions }) =>
					console.log(`[GraphQL error]: Message: ${message}, Location: ${locations}, Path: ${path}`),
				);
			}
			if (networkError) console.log(`[Network error]: ${networkError}`);
			// @ts-ignore
			if (networkError?.statusCode === 401) {
			}
		});

		// 5. Query/Mutation bilan Subscriptionni ajratish
		const splitLink = split(
			({ query }) => {
				const definition = getMainDefinition(query);
				return definition.kind === 'OperationDefinition' && definition.operation === 'subscription';
			},
			wsLink,
			authLink.concat(httpLink),
		);

		return from([errorLink, splitLink]);
	}
}

function createApolloClient() {
	return new ApolloClient({
		ssrMode: typeof window === 'undefined',
		link: createIsomorphicLink(),
		cache: new InMemoryCache(),
		resolvers: {},
	});
}

export function initializeApollo(initialState = null) {
	const _apolloClient = apolloClient ?? createApolloClient();
	if (initialState) _apolloClient.cache.restore(initialState);
	if (typeof window === 'undefined') return _apolloClient;
	if (!apolloClient) apolloClient = _apolloClient;

	return _apolloClient;
}

export function useApollo(initialState: any) {
	return useMemo(() => initializeApollo(initialState), [initialState]);
}
