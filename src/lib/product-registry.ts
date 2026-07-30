/**
 * Central product registry.
 * Every product TecPey hosts is declared here with its ID, slug,
 * required permission, feature flag, and runtime enabled state.
 * Add new products here — do not scatter product metadata across the codebase.
 */

import type { ProductId } from "./platform-types";
import { isFeatureEnabled, type FeatureFlag } from "./feature-flags";

export type { ProductId };

export type Product = {
  id: ProductId;
  slug: string;
  displayName: string;
  description: string;
  /** Minimum permission a session must hold to access this product. */
  requiredPermission:
    | "exchange.view"
    | "academy.view"
    | "social.view"
    | "mentor.chat"
    | "marketplace.access";
  featureFlag: FeatureFlag | null;
  /** Returns true if this product is currently enabled by its feature flag. */
  isEnabled: () => boolean;
};

type ProductDefinition = Omit<Product, "isEnabled">;

function defineProduct(definition: ProductDefinition): Product {
  return Object.freeze({
    ...definition,
    isEnabled: () =>
      definition.featureFlag === null
        ? true
        : isFeatureEnabled(definition.featureFlag),
  });
}

export const PRODUCTS: Readonly<Record<ProductId, Product>> = Object.freeze({
  exchange: defineProduct({
    id: "exchange",
    slug: "exchange",
    displayName: "TecPey Exchange",
    description: "Cryptocurrency trading and portfolio management.",
    requiredPermission: "exchange.view",
    featureFlag: "exchange.enabled",
  }),
  academy: defineProduct({
    id: "academy",
    slug: "academy",
    displayName: "TecPey Academy",
    description: "Structured crypto education from beginner to advanced.",
    requiredPermission: "academy.view",
    featureFlag: "academy.enabled",
  }),
  social: defineProduct({
    id: "social",
    slug: "social",
    displayName: "TecPey Social",
    description: "Community, groups, journals, and leaderboards.",
    requiredPermission: "social.view",
    featureFlag: "social.enabled",
  }),
  mentor: defineProduct({
    id: "mentor",
    slug: "mentor",
    displayName: "TecPey AI Mentor",
    description: "AI-powered learning coach and personalized progress tracker.",
    requiredPermission: "mentor.chat",
    featureFlag: "mentor.enabled",
  }),
  knowledge: defineProduct({
    id: "knowledge",
    slug: "knowledge-center",
    displayName: "Knowledge Center",
    description: "Reference library, glossary, and educational resources.",
    requiredPermission: "academy.view",
    featureFlag: null,
  }),
  marketplace: defineProduct({
    id: "marketplace",
    slug: "marketplace",
    displayName: "TecPey Marketplace",
    description: "Course marketplace and digital content storefront.",
    requiredPermission: "marketplace.access",
    featureFlag: "future.marketplace.enabled",
  }),
});

/** Returns all products that are currently enabled via their feature flag. */
export function getEnabledProducts(): Product[] {
  return Object.values(PRODUCTS).filter((p) => p.isEnabled());
}

/** Looks up a product by its URL slug. Returns null if not found. */
export function getProductBySlug(slug: string): Product | null {
  return Object.values(PRODUCTS).find((p) => p.slug === slug) ?? null;
}
