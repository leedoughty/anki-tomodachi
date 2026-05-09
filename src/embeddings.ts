import {
  pipeline,
  type FeatureExtractionPipeline,
} from "@huggingface/transformers";
import type { IEmbeddingFunction } from "chromadb";

const MODEL = "Xenova/multilingual-e5-small";

let extractor: FeatureExtractionPipeline | null = null;

async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractor) {
    extractor = (await pipeline("feature-extraction", MODEL, {
      dtype: "fp32",
    })) as FeatureExtractionPipeline;
  }
  return extractor;
}

export class MultilingualEmbeddingFunction implements IEmbeddingFunction {
  async generate(texts: string[]): Promise<number[][]> {
    const ext = await getExtractor();
    const prefixed = texts.map((t) => "query: " + t);
    const output = await ext(prefixed, { pooling: "mean", normalize: true });
    return output.tolist();
  }
}
