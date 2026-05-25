"use client";

import { User, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface UserAccount {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  createdAt: string;
}

import type { Dispatch, SetStateAction } from "react";

interface Props {
  userAccount: UserAccount | null;
  onAccountChange: Dispatch<SetStateAction<UserAccount | null>>;
  onNameSave: () => void;
  onEmailSave: () => void;
}

export function AccountSection({
  userAccount,
  onAccountChange,
  onNameSave,
  onEmailSave,
}: Props) {
  return (
    <Card className="rounded-2xl border-border/50">
      <CardHeader>
        <CardTitle className="text-base">Account</CardTitle>
        <CardDescription>Your account details</CardDescription>
      </CardHeader>
      <CardContent>
        {userAccount ? (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              {userAccount.image ? (
                <img src={userAccount.image} alt="" className="w-12 h-12 rounded-full" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                  <User className="size-6 text-muted-foreground" />
                </div>
              )}
              <div>
                <p className="text-sm font-medium">{userAccount.name || "Unnamed User"}</p>
                <p className="text-xs text-muted-foreground">{userAccount.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="size-3" />
              <span>Joined {new Date(userAccount.createdAt).toLocaleDateString()}</span>
            </div>
            <div className="pt-2 border-t border-border/30">
              <label htmlFor="user-name" className="text-xs text-muted-foreground block mb-1">Display Name</label>
              <div className="flex gap-2">
                <input
                  id="user-name"
                  type="text"
                  placeholder="Enter your name"
                  value={userAccount.name || ""}
                  onChange={(e) => onAccountChange(prev => prev ? { ...prev, name: e.target.value } : null)}
                  className="flex-1 text-sm bg-muted rounded-lg px-3 py-2 outline-none"
                />
                <Button
                  size="sm"
                  className="rounded-xl"
                  onClick={onNameSave}
                >
                  Save
                </Button>
              </div>
            </div>
            <div className="pt-2 border-t border-border/30">
              <label htmlFor="user-email" className="text-xs text-muted-foreground block mb-1">Email</label>
              <div className="flex gap-2">
                <input
                  id="user-email"
                  type="email"
                  placeholder="Enter your email"
                  value={userAccount.email || ""}
                  onChange={(e) => onAccountChange(prev => prev ? { ...prev, email: e.target.value } : null)}
                  className="flex-1 text-sm bg-muted rounded-lg px-3 py-2 outline-none"
                />
                <Button
                  size="sm"
                  className="rounded-xl"
                  onClick={onEmailSave}
                >
                  Save
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Loading...</p>
        )}
      </CardContent>
    </Card>
  );
}
