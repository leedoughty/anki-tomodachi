import { ChromaClient, IncludeEnum, type Collection } from "chromadb";
import type { CardDocument, CardMetadata, SearchResult } from "./types.js";

const CHROMA_URL = "http://localhost:8000";
const COLLECTION_NAME = "cards_semantic";
const BATCH_SIZE = 200;

let clientInstance: ChromaClient | null = null;

export function getChromaClient(): ChromaClient {
  if (!clientInstance) {
    clientInstance = new ChromaClient({ path: CHROMA_URL });
  }
  return clientInstance;
}

export async function getOrCreateCollection(
  client?: ChromaClient,
): Promise<Collection> {
  const c = client ?? getChromaClient();
  return c.getOrCreateCollection({ name: COLLECTION_NAME });
}

export async function addDocuments(
  collection: Collection,
  docs: CardDocument[],
): Promise<void> {
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = docs.slice(i, i + BATCH_SIZE);
    await collection.upsert({
      ids: batch.map((d) => d.id),
      documents: batch.map((d) => d.text),
      metadatas: batch.map(
        (d) =>
          d.metadata as unknown as Record<string, string | number | boolean>,
      ),
    });
  }
}

export interface SearchOptions {
  limit?: number;
  deck?: string;
  tags?: string[];
  minInterval?: number;
  maxEase?: number;
  cardType?: string;
}

function buildWhereFilter(
  options: SearchOptions,
): Record<string, unknown> | undefined {
  const conditions: Record<string, unknown>[] = [];

  if (options.deck) conditions.push({ deck: options.deck });
  if (options.cardType) conditions.push({ cardType: options.cardType });
  if (options.minInterval !== undefined)
    conditions.push({ interval: { $gte: options.minInterval } });
  if (options.maxEase !== undefined)
    conditions.push({ ease: { $lte: options.maxEase } });
  if (options.tags) {
    for (const tag of options.tags) {
      conditions.push({ tags: { $contains: tag } });
    }
  }

  if (conditions.length === 0) return undefined;
  if (conditions.length === 1) return conditions[0];
  return { $and: conditions };
}

export async function searchCards(
  query: string,
  options: SearchOptions = {},
): Promise<SearchResult[]> {
  const collection = await getOrCreateCollection();
  const where = buildWhereFilter(options);

  const results = await collection.query({
    queryTexts: [query],
    nResults: options.limit ?? 10,
    ...(where ? { where } : {}),
  });

  const ids = results.ids[0] ?? [];
  const documents = results.documents[0] ?? [];
  const metadatas = results.metadatas[0] ?? [];
  const distances = results.distances?.[0] ?? [];

  return ids.map((id, i) => ({
    id: id ?? "",
    text: documents[i] ?? "",
    metadata: (metadatas[i] ?? {}) as unknown as CardMetadata,
    distance: distances[i] ?? 0,
  }));
}

export interface StoredCard {
  id: string;
  text: string;
  metadata: CardMetadata;
}

export async function getAllCards(): Promise<StoredCard[]> {
  const collection = await getOrCreateCollection();
  const count = await collection.count();
  if (count === 0) return [];

  const results = await collection.get({
    include: [IncludeEnum.Documents, IncludeEnum.Metadatas],
    limit: count,
  });

  return results.ids.map((id, i) => ({
    id: id ?? "",
    text: (results.documents?.[i] ?? "") as string,
    metadata: (results.metadatas?.[i] ?? {}) as unknown as CardMetadata,
  }));
}

export async function getCollectionStats(
  collection?: Collection,
): Promise<{ count: number }> {
  const col = collection ?? (await getOrCreateCollection());
  const count = await col.count();
  return { count };
}
