const prisma = require("../config/prisma");
const { z } = require("zod");

// Same limits as the Settings form (5-240 minutes) and the timezones the dashboard can render
const updateSettingsSchema = z.object({
  session_timeout_minutes: z.number().int().min(5).max(240).optional(),
  timezone: z.enum(["WIB", "WITA", "WIT"]).optional(),
});

/**
 * GET /api/settings
 * Fetch global system settings. Initializes default if none exist.
 */
const getSettings = async (req, res) => {
  try {
    let settings = await prisma.system_settings.findFirst();
    
    // Auto-initialize if empty
    if (!settings) {
      settings = await prisma.system_settings.create({
        data: {
          session_timeout_minutes: 30,
          timezone: "WIB"
        }
      });
    }

    return res.status(200).json({ ok: true, data: settings });
  } catch (error) {
    console.error("Error fetching settings:", error);
    return res.status(500).json({ ok: false, message: "Failed to fetch settings" });
  }
};

/**
 * PATCH /api/settings
 * Update global system settings.
 */
const updateSettings = async (req, res) => {
  try {
    const validatedData = updateSettingsSchema.parse(req.body);

    let settings = await prisma.system_settings.findFirst();
    if (!settings) {
      settings = await prisma.system_settings.create({
        data: { session_timeout_minutes: 30, timezone: "WIB" }
      });
    }

    const updatedSettings = await prisma.system_settings.update({
      where: { setting_id: settings.setting_id },
      data: validatedData,
    });

    return res.status(200).json({ ok: true, data: updatedSettings, message: "Settings updated successfully" });
  } catch (error) {
    console.error("Error updating settings:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ ok: false, message: "Validation error", errors: error.errors });
    }
    return res.status(500).json({ ok: false, message: "Failed to update settings" });
  }
};

module.exports = {
  getSettings,
  updateSettings
};
