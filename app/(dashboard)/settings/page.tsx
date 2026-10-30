"use client";
import { apiUrl, fetchApi } from "@/lib/api";

import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { PageLayout } from "@/components/layout/PageLayout";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Icons
import { Loader2, MoreHorizontal, Plus, Save, Trash2 } from "lucide-react";

import { useTimezone } from "@/app/context/TimezoneContext";
import { formatDateTime } from "@/lib/format-date";
import { useUser } from "@/app/context/UserContext";
import { ROLES, RoleBadge, type Role } from "@/components/settings/RoleBadge";
import { AuditLogPanel } from "@/components/settings/AuditLogPanel";
import { t } from "@/lib/i18n";

// Session timeout limits, enforced again by PATCH /api/settings
const TIMEOUT_MIN = 5;
const TIMEOUT_MAX = 240;

const OFFSET_TO_SETTING: Record<number, string> = { 7: "WIB", 8: "WITA", 9: "WIT" };
const SETTING_TO_OFFSET: Record<string, number> = { WIB: 7, WITA: 8, WIT: 9 };

const validateTimeout = (value: string): string | null => {
  if (!/^\d+$/.test(value.trim())) return "Enter a whole number of minutes.";
  const minutes = parseInt(value, 10);
  if (minutes < TIMEOUT_MIN || minutes > TIMEOUT_MAX) return `Choose between ${TIMEOUT_MIN} and ${TIMEOUT_MAX} minutes.`;
  return null;
};

// Row shape returned by GET /api/users
interface AdminUser {
  user_id: string;
  email: string;
  display_name: string | null;
  is_active: boolean;
  last_active: string | null;
  // TODO: persisted per user once the backend has a role column (always "Admin" today)
  role?: Role;
}

export default function SettingsPage() {
  const { timezoneOffset, timeZone, setTimezoneOffset } = useTimezone();
  // Form drafts vs. the values last saved on the server; the timezone only applies app-wide after Save
  const [sessionTimeout, setSessionTimeout] = useState("30");
  const [draftOffset, setDraftOffset] = useState(timezoneOffset);
  const [saved, setSaved] = useState<{ timeout: string; offset: number } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const timeoutError = validateTimeout(sessionTimeout);
  const isDirty = saved !== null && (sessionTimeout.trim() !== saved.timeout || draftOffset !== saved.offset);
  
  // Users state
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [isUsersLoading, setIsUsersLoading] = useState(true);

  // Add Admin Modal States
  const [isAddAdminOpen, setIsAddAdminOpen] = useState(false);
  const [newAdminName, setNewAdminName] = useState("");
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [isAddingAdmin, setIsAddingAdmin] = useState(false);
  const [newUserRole, setNewUserRole] = useState<Role>("Admin");
  const { user: currentUser } = useUser();

  // Delete Admin Modal States
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [isDeletingAdmin, setIsDeletingAdmin] = useState(false);

  // Fetch Settings & Users on mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetchApi(apiUrl("/api/settings"));
        const json = await res.json();
        if (json.ok && json.data) {
          const timeout = json.data.session_timeout_minutes.toString();
          const offset = SETTING_TO_OFFSET[json.data.timezone] ?? 7;
          setSessionTimeout(timeout);
          setDraftOffset(offset);
          setSaved({ timeout, offset });
          setTimezoneOffset(offset);
        }
      } catch (err) {
        console.error("Failed to fetch settings", err);
      }
    };

    const fetchUsers = async () => {
      try {
        const res = await fetchApi(apiUrl("/api/users"));
        const json = await res.json();
        if (json.ok) {
          setAdmins(json.data);
        }
      } catch (err) {
        console.error("Failed to fetch users", err);
      } finally {
        setIsUsersLoading(false);
      }
    };

    fetchSettings();
    fetchUsers();
  }, [setTimezoneOffset]);

  const handleSaveGeneral = async () => {
    if (timeoutError || !isDirty) return;
    setIsSaving(true);
    try {
      const res = await fetchApi(apiUrl("/api/settings"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_timeout_minutes: parseInt(sessionTimeout, 10),
          timezone: OFFSET_TO_SETTING[draftOffset] ?? "WIB"
        })
      });

      const json = await res.json();
      if (json.ok) {
        const timeout = sessionTimeout.trim();
        setSaved({ timeout, offset: draftOffset });
        setTimezoneOffset(draftOffset);
        toast.success("Settings saved.");
      } else {
        toast.error(json.message || "Failed to save configuration.");
      }
    } catch {
      toast.error("An error occurred while saving.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddAdmin = async () => {
    if (!newAdminName || !newAdminEmail || !newAdminPassword) {
      toast.error("Please fill in all fields");
      return;
    }
    
    setIsAddingAdmin(true);
    try {
      const res = await fetchApi(apiUrl("/api/users"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newAdminName,
          email: newAdminEmail,
          password: newAdminPassword
        })
      });
      const json = await res.json();
      
      if (json.ok) {
        setAdmins([json.data, ...admins]);
        setNewAdminName("");
        setNewAdminEmail("");
        setNewAdminPassword("");
        setIsAddAdminOpen(false);
        toast.success("New admin added successfully");
      } else {
        toast.error(json.message || "Failed to add admin");
      }
    } catch {
      toast.error("An error occurred while adding the admin.");
    } finally {
      setIsAddingAdmin(false);
    }
  };

  const userPendingDelete = admins.find((a) => a.user_id === userToDelete) ?? null;

  const confirmDelete = (userId: string) => {
    setUserToDelete(userId);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    setIsDeletingAdmin(true);

    try {
      const res = await fetchApi(apiUrl(`/api/users/${userToDelete}`), {
        method: "DELETE"
      });
      const json = await res.json();

      if (json.ok) {
        setAdmins(admins.filter(a => a.user_id !== userToDelete));
        toast.success("Admin deleted successfully");
        setIsDeleteModalOpen(false);
      } else {
        toast.error(json.message || "Failed to delete admin");
      }
    } catch {
      toast.error("An error occurred while deleting the admin.");
    } finally {
      setIsDeletingAdmin(false);
      setUserToDelete(null);
    }
  };

  return (
    <PageLayout
      title={t("pages.settings.title")}
      description={t("pages.settings.description")}
    >
      <Tabs defaultValue="general" className="w-full">
        <TabsList>
          <TabsTrigger value="general">General Settings</TabsTrigger>
          <TabsTrigger value="rbac">Access Control (RBAC)</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
        </TabsList>
        
        {/* TAB 1: GENERAL SETTINGS */}
        <TabsContent value="general">
          <Card className="overflow-hidden pb-0">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-foreground">System preferences</CardTitle>
              <CardDescription>Update your honeypot environment variables and global settings.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              
              <div className="space-y-2 max-w-sm">
                <Label htmlFor="timezone" className="text-foreground">System Timezone</Label>
                <Select value={draftOffset.toString()} onValueChange={(val) => setDraftOffset(parseInt(val, 10))}>
                  <SelectTrigger id="timezone" className="w-full">
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">WIB (UTC+7)</SelectItem>
                    <SelectItem value="8">WITA (UTC+8)</SelectItem>
                    <SelectItem value="9">WIT (UTC+9)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">All attack logs will be displayed in this timezone.</p>
              </div>

              <div className="space-y-2 max-w-sm">
                <Label htmlFor="timeout" className="text-foreground">Session Timeout</Label>
                <div className="relative">
                  <Input
                    id="timeout"
                    type="number"
                    inputMode="numeric"
                    min={TIMEOUT_MIN}
                    max={TIMEOUT_MAX}
                    step={1}
                    value={sessionTimeout}
                    onChange={(e) => setSessionTimeout(e.target.value)}
                    aria-invalid={!!timeoutError}
                    aria-describedby="timeout-help"
                    className="pr-20"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">minutes</span>
                </div>
                {timeoutError ? (
                  <p id="timeout-help" role="alert" className="text-xs text-destructive">{timeoutError}</p>
                ) : (
                  <p id="timeout-help" className="text-xs text-muted-foreground">
                    Log out administrators after this much inactivity ({TIMEOUT_MIN}–{TIMEOUT_MAX} minutes).
                  </p>
                )}
              </div>

            </CardContent>
            <CardFooter className="bg-muted/50 border-t border-border py-4 flex justify-start">
              <Button onClick={handleSaveGeneral} disabled={isSaving || !isDirty || !!timeoutError} className="gap-2 px-6">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* TAB 2: ACCESS CONTROL (RBAC) */}
        <TabsContent value="rbac" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-foreground">User management</h2>
              <p className="text-sm text-muted-foreground">
                Roles: Admin (full access), Analyst (review and report), Viewer (read-only). Only Admin can be assigned until roles are stored by the backend.
              </p>
            </div>
            <Button onClick={() => setIsAddAdminOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" aria-hidden />
              Add User
            </Button>
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Last Active</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isUsersLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-muted-foreground">Loading users…</TableCell>
                  </TableRow>
                ) : admins.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-muted-foreground">No administrators found.</TableCell>
                  </TableRow>
                ) : (
                  admins.map((admin) => {
                    const isSelf = currentUser?.user_id === admin.user_id;
                    return (
                    <TableRow key={admin.user_id} className="hover:bg-muted/50 transition-colors border-b-border">
                      <TableCell className="font-medium text-foreground flex items-center gap-3">
                        <div className="flex flex-col">
                          <span>
                            {admin.display_name ?? admin.email}
                            {isSelf && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(You)</span>}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground font-normal">ID {admin.user_id?.substring(0, 8)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{admin.email}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <RoleBadge role={admin.role ?? "Admin"} />
                          {!admin.is_active && <Badge variant="outline" className="font-medium text-muted-foreground">Inactive</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-muted-foreground">
                        {admin.last_active ? formatDateTime(admin.last_active, timeZone) : "Never"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground h-8 w-8" aria-label={`Actions for ${admin.display_name ?? admin.email}`}>
                                <MoreHorizontal className="h-4 w-4" aria-hidden />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuItem
                                className="cursor-pointer text-destructive focus:text-destructive focus:bg-accent flex items-center gap-2"
                                onClick={() => confirmDelete(admin.user_id)}
                                disabled={isSelf}
                              >
                                <Trash2 className="h-4 w-4" aria-hidden />
                                <span>{isSelf ? "You can't revoke your own access" : "Revoke Access"}</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* TAB 3: AUDIT LOG */}
        <TabsContent value="audit">
          <AuditLogPanel />
        </TabsContent>
      </Tabs>

      {/* Add Admin Modal */}
      <Dialog open={isAddAdminOpen} onOpenChange={setIsAddAdminOpen}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Add user</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Give a new user access to the Obsera dashboard.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="admin-name">Full Name</Label>
              <Input 
                id="admin-name" 
                placeholder="e.g. John Doe" 
                
                value={newAdminName}
                onChange={(e) => setNewAdminName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-email">Email Address</Label>
              <Input 
                id="admin-email" 
                type="email" 
                placeholder="e.g. john@obsera.local" 
                
                value={newAdminEmail}
                onChange={(e) => setNewAdminEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-password">Password</Label>
              <Input 
                id="admin-password" 
                type="password" 
                placeholder="Minimum 6 characters"

                value={newAdminPassword}
                onChange={(e) => setNewAdminPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-role">Role</Label>
              <Select value={newUserRole} onValueChange={(value) => setNewUserRole(value as Role)}>
                <SelectTrigger id="admin-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((role) => (
                    <SelectItem key={role.value} value={role.value} disabled={role.value !== "Admin"}>
                      {role.value} — {role.description}
                      {role.value !== "Admin" && " (coming soon)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Analyst and Viewer need role support in the backend (users.role column).</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddAdminOpen(false)} disabled={isAddingAdmin}>Cancel</Button>
            <Button onClick={handleAddAdmin} disabled={isAddingAdmin} className="gap-2">
              {isAddingAdmin ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {isAddingAdmin ? "Saving..." : "Add user"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteModalOpen} onOpenChange={(open) => !isDeletingAdmin && setIsDeleteModalOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke access?</AlertDialogTitle>
            <AlertDialogDescription>
              {userPendingDelete
                ? `${userPendingDelete.display_name ?? userPendingDelete.email} (${userPendingDelete.email}, ${userPendingDelete.role ?? "Admin"}) will lose access to the Obsera dashboard immediately. This cannot be undone.`
                : "This user will lose access to the Obsera dashboard immediately. This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingAdmin}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeletingAdmin}
              className="gap-2 bg-destructive text-background hover:bg-destructive/90"
              onClick={(e) => {
                // Keep the dialog open until the request finishes
                e.preventDefault();
                handleDeleteUser();
              }}
            >
              {isDeletingAdmin ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
              {isDeletingAdmin ? "Revoking..." : "Revoke access"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageLayout>
  );
}
