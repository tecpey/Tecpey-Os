# White-Label Platform — پلتفرم برچسب سفید تک‌پی

**Date:** 2026-07-05
**Phase:** 39.5 — Strategic Freeze & TecPey DNA Synchronization
**Status:** Official — Permanent White-Label Architecture
**Classification:** Internal — Strategic Business Architecture

---

## ۱. مقدمه / Introduction

White-Label is TecPey's Enterprise B2B product. It allows universities, prop firms, financial institutions, governments, and educational organizations to deploy the full TecPey platform — Academy, AI Mentor, Trading Arena, and Exchange — under their own brand, on their own domain, with their own configuration.

این محصول استراتژیک تک‌پی برای ورود به بازار سازمانی است.

---

## 2. Business Model

### 2.1 License Types

| Type | Description | Target | Pricing Model |
|------|-------------|--------|---------------|
| **Academy Only** | Full Academy + AI Mentor + Trading Arena | Universities, schools | Per-student/month |
| **Enterprise Suite** | Academy + AI + Arena + Analytics + API | Corporations, banks | Annual contract + per-seat |
| **Full Platform** | Everything including Exchange integration | Prop firms, fintech | Revenue share + setup fee |
| **Government** | Custom deployment with compliance | National programs | Custom contract |
| **Non-Profit** | Discounted Academy access | NGOs, educational charities | Subsidized rate |

### 2.2 Revenue Model

| Stream | Description | See Also |
|--------|-------------|----------|
| Setup Fee | One-time deployment and configuration | [[REVENUE_MODEL.md]] |
| Monthly Subscription | Per-seat or flat fee | [[REVENUE_MODEL.md]] |
| Premium Add-ons | Custom modules, dedicated support | [[REVENUE_MODEL.md]] |
| Revenue Share | Exchange trading fee share (Full Platform) | [[REVENUE_MODEL.md]] |
| API Usage | API call volume overages | [[REVENUE_MODEL.md]] |

---

## 3. Tenant Architecture

### 3.1 Tenant Model

Every white-label deployment is a **Tenant** in TecPey's multi-tenant architecture (see [[MASTER_BLUEPRINT_v3.md]] Section 3).

```
Tenant
├── id: UUID
├── slug: string (URL-safe identifier)
├── displayName: string (e.g., "University of Tehran — Financial Literacy Program")
├── plan: TenantPlan (academy_only | enterprise | full_platform | government | non_profit)
├── config: TenantConfig (JSONB)
│   ├── aiModel: string
│   ├── rateLimits: Record<string, number>
│   ├── features: FeatureFlags
│   ├── branding: BrandingConfig
│   ├── domains: string[]
│   ├── locales: string[]
│   ├── supportEmail: string
│   └── termsOfService: string (custom or platform default)
├── domain: string | null (custom domain)
├── subdomain: string | null (tenant.tecpey.ir)
├── billing: BillingConfig
├── status: "active" | "suspended" | "trial" | "cancelled"
├── createdAt: timestamp
└── updatedAt: timestamp
```

### 3.2 Data Isolation

| Level | Method | Isolation | Cost |
|-------|--------|-----------|------|
| **Standard** | Row-level (tenant_id on all tables) | Logical | Low |
| **Premium** | Schema-per-tenant | Physical | Medium |
| **Enterprise** | Dedicated database instance | Full | High |

Standard isolation is the default. Premium and Enterprise are upgrade paths for regulated industries.

---

## 4. Branding System

### 4.1 BrandingConfig

```typescript
type BrandingConfig = {
  // Visual Identity
  logo: { light: URL; dark: URL; favicon: URL };
  colors: {
    primary: string;       // HEX
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
  };
  fonts: {
    primary: string;       // Font family name
    heading: string;
    monospace: string;
  };
  borderRadius: "none" | "sm" | "md" | "lg" | "full";
  spacing: "compact" | "comfortable" | "spacious";

  // Content
  tagline: string;         // Tenant-specific tagline
  description: string;     // SEO meta description
  locale: string;          // Default language

  // AI
  aiName: string;          // e.g., "UoT Mentor" instead of "TecPey AI Mentor"
  aiPersonality: string;   // Custom AI behavior instructions

  // Legal
  privacyUrl: URL;
  termsUrl: URL;
  supportEmail: string;
};
```

### 4.2 Custom Domains

| Feature | Support | Implementation |
|---------|---------|---------------|
| Custom domain | ✅ | CNAME → TecPey edge |
| Subdomain | ✅ | `tenant.tecpey.ir` |
| SSL auto-provision | ✅ | Let's Encrypt via Certbot |
| Domain verification | ✅ | TXT record verification |
| Multiple domains | ⚠️ | Premium tier |
| Custom email domain | ⚠️ | Requires tenant email service |

### 4.3 Theme Inheritance

```
Platform Default Theme
    ↓
Tenant Branding Override (partial — only specified fields override)
    ↓
User Preferences (dark/light mode, font size, accessibility)
```

Tenants can override as little as a single color or as much as the full theme.

---

## 5. Localization Architecture

### 5.1 Tenant Locale Configuration

| Setting | Description |
|---------|-------------|
| `defaultLocale` | Primary language for the tenant |
| `availableLocales` | Enabled languages |
| `rtlEnabled` | RTL support toggle |
| `translationOverrides` | Custom translations for tenant-specific terms |

### 5.2 Locale Inheritance

```
Platform Translations (fa-IR, en-US, ar, etc.)
    ↓
Tenant Overrides (custom terms, brand-specific naming)
    ↓
User Preference
```

---

## 6. Customer Dashboard

Every white-label tenant has access to a dedicated admin dashboard:

| Feature | Description | Phase |
|---------|-------------|-------|
| Student Management | View, manage, export student data | 44 |
| Progress Analytics | Cohort completion rates, behavioral trends | 44 |
| Certificate Oversight | Issue, verify, revoke certificates | 44 |
| AI Usage Reports | Mentor interaction analytics per student | 49 |
| Custom Content | Upload tenant-specific lessons, terms | 28 |
| Billing Overview | Current plan, usage, invoices | 44 |
| Support Queue | Manage student support tickets | 44 |
| White-Label Settings | Branding, domain, AI configuration | 44 |

---

## 7. Billing & Subscription

### 7.1 Billing Model

| Tier | Billing Cycle | Payment Method | Notes |
|------|---------------|----------------|-------|
| Academy Only | Monthly/Annual | Direct invoice, online payment | Per active student |
| Enterprise | Annual | Annual contract + quarterly invoices | Custom pricing |
| Full Platform | Annual + revenue share | Contract + automated reports | Exchange volume share |
| Government | Custom | Government PO, annual | Bespoke terms |

### 7.2 Subscription Management

- Automated provisioning on payment
- Grace period: 14 days past due → read-only → 30 days → suspension
- Self-service upgrade/downgrade at next billing cycle
- Usage-based overage billing for API calls and AI tokens

---

## 8. Deployment Models

| Model | Description | Best For | Complexity |
|-------|-------------|----------|------------|
| **Cloud (TecPey Hosted)** | Multi-tenant SaaS on TecPey infrastructure | Small-medium tenants | Low |
| **Dedicated Cloud** | Single-tenant instance in TecPey-managed cloud | Enterprise | Medium |
| **On-Premise** | Tenant self-hosts on their infrastructure | Regulated/government | High |
| **Hybrid** | Core in TecPey cloud, sensitive data on-premise | Mixed compliance | High |

---

## 9. Marketplace Integration

White-label tenants can participate in the [[MARKETPLACE_PLATFORM.md]]:

| Feature | Academy Only | Enterprise | Full Platform |
|---------|-------------|------------|---------------|
| Browse marketplace | ✅ | ✅ | ✅ |
| Publish own content | ⚠️ Review required | ✅ | ✅ |
| Revenue from sales | 70% share | 80% share | 85% share |
| Custom marketplace | ❌ | ⚠️ Add-on | ✅ |
| Private marketplace (org only) | ❌ | ⚠️ Add-on | ✅ |

---

## 10. API Access

| Tier | API Access | Rate Limit | Webhooks |
|------|-----------|------------|----------|
| Academy Only | Student data, certificates | Standard | Standard |
| Enterprise | Full platform API | High | High |
| Full Platform | All APIs including exchange | Custom | Real-time |
| Government | Custom SLA | Custom | Custom |

---

## 11. Analytics & Monitoring

Per-tenant analytics available in the customer dashboard:

- **Student Analytics:** Enrollment, progress, completion, behavioral trends
- **Financial Analytics:** Revenue, MRR, churn, LTV (platform owner only)
- **AI Analytics:** Usage patterns, popular topics, satisfaction scores
- **Operational Analytics:** Uptime, latency, error rates (SLA monitoring)

---

## 12. Custom Modules

Tenants can request custom modules:

| Module | Description | Development Cost |
|--------|-------------|-----------------|
| Custom Curriculum | Tenant-specific lessons and terms | Per-term |
| Branded Certificates | Co-branded certificates with tenant logo | One-time |
| Custom AI Personality | Tenant-specific AI behavior and knowledge | Per-config |
| Specialized Assessments | Tenant-specific quizzes and evaluations | Per-assessment |
| Integration Connector | Connect to tenant's existing LMS/SIS | Per-integration |

---

## 13. Security Isolation

| Layer | Standard | Premium | Enterprise |
|-------|----------|---------|------------|
| Data isolation | Row-level (tenant_id) | Schema-per-tenant | Dedicated DB |
| Encryption | AES-256 at rest, TLS in transit | AES-256 + customer-managed key | Full HSM |
| Audit logs | Standard | Extended retention | Real-time export |
| Compliance | Platform compliance | SOC2-type report | Custom compliance |
| Penetration testing | Annual | Bi-annual | On request |

---

## 14. Support Model

| Tier | Support Channel | Response Time | Dedicated Support |
|------|----------------|---------------|-------------------|
| Academy Only | Email + Ticketing | 24 hours | — |
| Enterprise | Email + Ticketing + Chat | 4 hours | Technical account manager |
| Full Platform | All channels + Phone | 1 hour | Dedicated engineering contact |
| Government | All channels + On-site | Custom | Dedicated team |

---

## 15. Upgrade Path

```
Academy Only
    ↓ (add Exchange + API)
Enterprise Suite
    ↓ (add custom deployment)
Full Platform
    ↓ (add dedicated infra)
Enterprise Dedicated
```

Upgrades are seamless — no data migration required. Feature flags are enabled at the tenant level.

---

## 16. Operational Model

| Operation | Frequency | Automation |
|-----------|-----------|------------|
| Tenant provisioning | On sign-up | Fully automated |
| SSL certificate renewal | Every 60 days | Automated via Certbot |
| Backup | Daily | Automated |
| Usage report generation | Monthly | Automated |
| Billing invoice | Monthly/Annual | Automated |
| Tenant deprovisioning | On cancellation | 30-day grace, then automated |
| Security patching | Continuous | Automated with manual oversight |

---

## 17. Future Expansion

| Capability | Phase | Description |
|-----------|-------|-------------|
| Self-service tenant onboarding | 44 | Tenants sign up, configure, deploy without sales |
| White-label marketplace | 48 | Tenants run their own marketplace |
| Multi-region deployment | 50+ | Tenant chooses data residency region |
| AI model marketplace | 50+ | Tenants select from curated AI models |
| Plugin SDK | 50+ | Developers build custom modules for tenants |
| Tenant referral program | 50+ | Existing tenants refer new tenants |

---

## 18. Implementation Phases

| Phase | White-Label Milestone | Dependencies |
|-------|----------------------|--------------|
| 44 | 🚧 Tenant infrastructure (tables, resolution, isolation) | Phase 42 (Unified Auth) |
| 44 | 🚧 Tenant admin dashboard V1 | Phase 44 tenant infra |
| 44 | 🚧 White-label branding system (colors, logo, domain) | Phase 44 tenant infra |
| 48 | 🚧 Self-service onboarding + billing | Phase 44 tenant infra |
| 49 | 🚧 White-label AI customization | Phase 44 + Phase 49 AI OS |
| 50 | 🚧 Marketplace integration for tenants | Phase 48 Marketplace |

---

*این سند، معماری برچسب سفید تک‌پی را تعریف می‌کند. محصول استراتژیک برای ورود به بازار سازمانی.*
*This document defines the TecPey White-Label architecture. Strategic product for enterprise market entry.*
