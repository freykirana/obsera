"use client";

import { useState } from "react";
import { fromZonedTime } from "date-fns-tz";
import { CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTimezone } from "@/app/context/TimezoneContext";
import { formatInZone, timezoneLabelFromOffset } from "@/lib/format-date";
import { MAX_CUSTOM_SPAN_MS, PRESET_RANGES, isPresetRange, useTimeRange } from "@/lib/time-range";

// <input type="datetime-local"> value, expressed in the Settings timezone
const INPUT_PATTERN = "yyyy-MM-dd'T'HH:mm";
const CUSTOM_VALUE = "custom";

export function GlobalTimeRange() {
  const { timeRange, timeZone, title, setPreset, setCustom } = useTimeRange();
  const { timezoneOffset } = useTimezone();
  const tzLabel = timezoneLabelFromOffset(timezoneOffset);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [fromValue, setFromValue] = useState("");
  const [toValue, setToValue] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const activeValue = timeRange.kind === "preset" ? timeRange.range : CUSTOM_VALUE;

  const openCustomDialog = () => {
    // Prefill with the active custom range, or the last 24 hours
    const now = Date.now();
    const from = timeRange.kind === "custom" ? timeRange.from : now - 24 * 60 * 60 * 1000;
    const to = timeRange.kind === "custom" ? timeRange.to : now;
    setFromValue(formatInZone(from, timeZone, INPUT_PATTERN));
    setToValue(formatInZone(to, timeZone, INPUT_PATTERN));
    setFormError(null);
    setIsDialogOpen(true);
  };

  const handleSelect = (value: string) => {
    if (value === CUSTOM_VALUE) openCustomDialog();
    else if (isPresetRange(value)) setPreset(value);
  };

  const applyCustomRange = () => {
    if (!fromValue || !toValue) {
      setFormError("Choose both a start and an end time.");
      return;
    }
    const from = fromZonedTime(fromValue, timeZone);
    const to = fromZonedTime(toValue, timeZone);
    const span = to.getTime() - from.getTime();
    if (!Number.isFinite(span) || span <= 0) {
      setFormError("The end time must be after the start time.");
      return;
    }
    if (span > MAX_CUSTOM_SPAN_MS) {
      setFormError("A custom range can cover at most 366 days.");
      return;
    }
    setCustom(from, to);
    setIsDialogOpen(false);
  };

  return (
    <>
      {/* Wide screens (>= lg): segmented control */}
      <div className="hidden items-center gap-2 lg:flex">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={timeRange.kind === "preset" ? timeRange.range : ""}
          onValueChange={(value) => value && handleSelect(value)}
          aria-label="Time range"
        >
          {PRESET_RANGES.map((p) => (
            <ToggleGroupItem key={p.value} value={p.value} aria-label={p.label} className="text-xs">
              {p.short}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Button
          size="sm"
          variant={timeRange.kind === "custom" ? "secondary" : "outline"}
          onClick={openCustomDialog}
          className="h-8 max-w-[22rem] gap-1.5 text-xs"
          title={timeRange.kind === "custom" ? title : "Choose a custom range"}
        >
          <CalendarRange className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className={timeRange.kind === "custom" ? "truncate font-mono" : "truncate"}>{timeRange.kind === "custom" ? title : "Custom"}</span>
        </Button>
      </div>

      {/* Narrower screens: compact select */}
      <Select value={activeValue} onValueChange={handleSelect}>
        <SelectTrigger size="sm" className="lg:hidden" aria-label="Time range">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRESET_RANGES.map((p) => (
            <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
          ))}
          <SelectItem value={CUSTOM_VALUE}>Custom range…</SelectItem>
        </SelectContent>
      </Select>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Custom time range</DialogTitle>
            <DialogDescription>Times are in {tzLabel} ({timeZone}). Maximum span: 366 days.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="range-from">From</Label>
              <Input id="range-from" type="datetime-local" value={fromValue} onChange={(e) => setFromValue(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="range-to">To</Label>
              <Input id="range-to" type="datetime-local" value={toValue} onChange={(e) => setToValue(e.target.value)} />
            </div>
            {formError && (
              <p role="alert" className="text-sm text-destructive">{formError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={applyCustomRange}>Apply range</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
