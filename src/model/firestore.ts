import * as z from "zod/mini";

/** Names of the Firestore collections, kept as constants to avoid typos. */
export const COLLECTIONS = {
  locations: "locations",
  sodas: "sodas",
  availability: "availability",
} as const;

const nonBlankString = z.string().check(z.refine((value) => value.trim().length > 0));
const MEANINGFUL_CHARACTER = /[\p{L}\p{M}\p{N}\p{P}\p{S}]/u;
const meaningfulString = z.string().check(z.refine((value) => MEANINGFUL_CHARACTER.test(value)));
const boundedString = (maximum: number) => meaningfulString.check(z.maxLength(maximum));
const attributionNameSchema = z.string().check(
  z.maxLength(320),
  z.refine((value) => value.length === 0 || MEANINGFUL_CHARACTER.test(value)),
);

/** Convert a Firestore Timestamp-like value to a valid Date. */
export const firestoreTimestampSchema = z.pipe(
  z.transform((value: unknown) => {
    if (typeof value !== "object" || value === null) return undefined;
    const toDate = Reflect.get(value, "toDate");
    if (typeof toDate !== "function") return undefined;
    try {
      return Reflect.apply(toDate, value, []);
    } catch {
      return undefined;
    }
  }),
  z.date(),
);

/** A postal address for a location. */
export const addressSchema = z.object({
  street: z.string(),
  city: z.string(),
  state: z.string(),
  postalCode: z.string(),
});
export type Address = z.infer<typeof addressSchema>;

/** A latitude/longitude coordinate pair. */
export const geoPointSchema = z.object({ lat: z.number(), lng: z.number() });
export type GeoPoint = z.infer<typeof geoPointSchema>;

const lenientOptional = <Schema extends z.ZodMiniType>(schema: Schema) =>
  z.optional(
    z.pipe(
      z.unknown(),
      z.transform((value) => {
        const parsed = schema.safeParse(value);
        return parsed.success ? parsed.data : undefined;
      }),
    ),
  );

/** Runtime schema for an untrusted `locations/{id}` document. */
export const locationDocumentSchema = z.pipe(
  z.object({
    name: z.string(),
    address: addressSchema,
    geo: geoPointSchema,
    geohash: z.string(),
    createdBy: lenientOptional(nonBlankString),
    createdByName: lenientOptional(nonBlankString),
    createdAt: lenientOptional(firestoreTimestampSchema),
    updatedBy: lenientOptional(nonBlankString),
    updatedByName: lenientOptional(nonBlankString),
    updatedAt: lenientOptional(firestoreTimestampSchema),
  }),
  z.transform(
    ({
      name,
      address,
      geo,
      geohash,
      createdBy,
      createdByName,
      createdAt,
      updatedBy,
      updatedByName,
      updatedAt,
    }) => ({
      name,
      address,
      geo,
      geohash,
      ...(createdBy === undefined ? {} : { createdBy }),
      ...(createdByName === undefined ? {} : { createdByName }),
      ...(createdAt === undefined ? {} : { createdAt }),
      ...(updatedBy === undefined ? {} : { updatedBy }),
      ...(updatedByName === undefined ? {} : { updatedByName }),
      ...(updatedAt === undefined ? {} : { updatedAt }),
    }),
  ),
);
export type Location = z.output<typeof locationDocumentSchema>;

const sodaCatalogFields = {
  name: nonBlankString,
  brand: nonBlankString,
  flavor: nonBlankString,
  aliases: z.optional(z.array(nonBlankString)),
};

/** Runtime schema for the catalog fields displayed by the application. */
export const sodaDocumentSchema = z
  .object({
    ...sodaCatalogFields,
    updatedByName: z.optional(nonBlankString),
    updatedAt: z.optional(firestoreTimestampSchema),
  })
  .check(
    z.refine(
      ({ updatedByName, updatedAt }) => (updatedByName === undefined) === (updatedAt === undefined),
      { error: "Soda update attribution must be complete." },
    ),
  );

/** A soda product. Stored under `sodas/{sodaId}`. */
export const sodaSchema = z.object({
  ...sodaCatalogFields,
  initialAvailabilityId: z.optional(z.string()),
  createdBy: z.optional(z.string()),
  createdByName: z.optional(z.string()),
  createdAt: z.optional(z.date()),
  updatedBy: z.optional(z.string()),
  updatedByName: z.optional(z.string()),
  updatedAt: z.optional(z.date()),
});
export type Soda = z.infer<typeof sodaSchema>;

/** The physical form a soda is sold in at a location. */
export const sodaFormSchema = z.enum(["draft", "can", "bottle"]);
export type SodaForm = z.infer<typeof sodaFormSchema>;

const availabilityFields = {
  locationId: z.string(),
  sodaId: z.string(),
  form: sodaFormSchema,
  sodaName: z.string(),
  sodaBrand: z.string(),
  sodaFlavor: z.string(),
};

const AVAILABILITY_ATTRIBUTION_FIELDS = [
  "createdBy",
  "createdByName",
  "createdAt",
  "updatedBy",
  "updatedByName",
  "updatedAt",
] as const;

const availabilityInputSchema = z.pipe(
  z.unknown().check(
    z.refine(
      (value) => {
        if (typeof value !== "object" || value === null) return true;
        const count = AVAILABILITY_ATTRIBUTION_FIELDS.filter((field) =>
          Object.hasOwn(value, field),
        ).length;
        return count === 0 || count === AVAILABILITY_ATTRIBUTION_FIELDS.length;
      },
      { error: "Availability attribution must be absent or complete." },
    ),
  ),
  z.transform((value) =>
    typeof value === "object" && value !== null ? Object.fromEntries(Object.entries(value)) : value,
  ),
);

/** Runtime schema for an untrusted `availability/{id}` document. */
export const availabilityDocumentSchema = z.pipe(
  availabilityInputSchema,
  z
    .object({
      ...availabilityFields,
      createdBy: z.optional(nonBlankString),
      createdByName: z.optional(z.string()),
      createdAt: z.optional(firestoreTimestampSchema),
      updatedBy: z.optional(nonBlankString),
      updatedByName: z.optional(z.string()),
      updatedAt: z.optional(firestoreTimestampSchema),
    })
    .check(
      z.refine(
        (value) =>
          AVAILABILITY_ATTRIBUTION_FIELDS.every((field) => value[field] === undefined) ||
          AVAILABILITY_ATTRIBUTION_FIELDS.every((field) => value[field] !== undefined),
        { error: "Availability attribution must be absent or complete." },
      ),
    ),
);

/**
 * A join record describing which soda is available at which location and in what
 * form. The `soda*` fields are denormalized for rendering without another read.
 */
export const availabilitySchema = z.object({
  ...availabilityFields,
  createdBy: z.optional(z.string()),
  createdByName: z.optional(z.string()),
  createdAt: z.optional(z.date()),
  updatedBy: z.optional(z.string()),
  updatedByName: z.optional(z.string()),
  updatedAt: z.optional(z.date()),
});
export type Availability = z.infer<typeof availabilitySchema>;

/** Application-owned location data validated before adding server timestamps. */
export const locationWriteSchema = z.strictObject({
  name: boundedString(200),
  address: z.object({
    street: boundedString(200),
    city: boundedString(100),
    state: boundedString(100),
    postalCode: boundedString(20),
  }),
  geo: z.object({
    lat: z.number().check(z.minimum(-90), z.maximum(90)),
    lng: z.number().check(z.minimum(-180), z.maximum(180)),
  }),
  geohash: boundedString(20),
  createdBy: meaningfulString,
  createdByName: attributionNameSchema,
  updatedBy: meaningfulString,
  updatedByName: attributionNameSchema,
});

/** Application-owned availability data validated before adding server timestamps. */
export const availabilityWriteSchema = z.strictObject({
  locationId: boundedString(1500),
  sodaId: boundedString(1500),
  form: sodaFormSchema,
  sodaName: boundedString(200),
  sodaBrand: boundedString(200),
  sodaFlavor: boundedString(200),
  createdBy: meaningfulString,
  createdByName: attributionNameSchema,
  updatedBy: meaningfulString,
  updatedByName: attributionNameSchema,
});

const canonicalSodaFields = {
  name: boundedString(200),
  brand: boundedString(200),
  flavor: boundedString(200),
};

/** Canonical soda fields accepted from a new contribution. */
export const canonicalSodaSchema = z.strictObject(canonicalSodaFields);

/** Application-owned soda data validated before adding server timestamps. */
export const sodaWriteSchema = z.strictObject({
  ...canonicalSodaFields,
  initialAvailabilityId: boundedString(1500),
  createdBy: meaningfulString,
  createdByName: attributionNameSchema,
  updatedBy: meaningfulString,
  updatedByName: attributionNameSchema,
});
