const { z } = require("zod");

// Reusable date range validation
const dateStringSchema = z.string().datetime().optional();

const getLogsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().default(50),
    sortBy: z.enum(["access_time", "first_seen", "source_ip", "attempt_number", "status", "created_at"]).default("access_time"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
    search: z.string().optional(),
    status: z.string().optional(), // Can be comma-separated like "Reviewed,Unreviewed"
    riskLevel: z.string().optional(), // Can be comma-separated like "High,Medium,Low"
    startDate: dateStringSchema,
    endDate: dateStringSchema,
    aggregate: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
    // Global time range (validated/whitelisted again by resolveTimeWindow)
    range: z.string().max(16).optional(),
    from: z.string().max(40).optional(),
    to: z.string().max(40).optional(),
    tz: z.string().max(40).optional(),
    timezoneOffset: z.string().optional(),
  })
});

const updateStatusSchema = z.object({
  body: z.object({
    attackerIds: z.array(z.string().uuid("Invalid attacker ID format")).min(1, "At least one attacker ID is required"),
    status: z.enum(["Reviewed", "Unreviewed"]),
  })
});


const validateRequest = (schema) => (req, res, next) => {
  try {
    const validatedData = schema.parse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    
    // Replace req object with validated and transformed data
    req.body = validatedData.body;
    req.query = validatedData.query;
    req.params = validatedData.params;
    
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        message: "Validation Error",
        errors: error.errors,
      });
    }
    return res.status(500).json({
      ok: false,
      message: "Internal Server Error during validation",
    });
  }
};

module.exports = {
  getLogsSchema,
  updateStatusSchema,
  validateRequest,
};
