import { useQuery } from "@tanstack/react-query";
import * as React from "react";

import {
  formatExternalAgentRuntimeLabel,
  saveExternalAgentPresentation,
  type ExternalAgentPresentation,
} from "@/features/agents/externalAgentPresentation";
import { ProfileAvatar } from "@/features/profile/ui/ProfileAvatar";
import { ProfileAvatarEditor } from "@/features/profile/ui/ProfileAvatarEditor";
import { getUserProfile } from "@/shared/api/tauriProfiles";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";

export type ExternalAgentEditorTarget = {
  pubkey: string;
  name: string;
  avatarUrl: string | null;
  agentType: string | null;
};

export function ExternalAgentPresentationDialog({
  agent,
  onOpenChange,
  open,
  presentation,
  scope,
}: {
  agent: ExternalAgentEditorTarget | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  presentation: ExternalAgentPresentation | null;
  scope: string | null;
}) {
  const profileQuery = useQuery({
    enabled: open && agent !== null,
    queryKey: ["external-agent-base-profile", agent?.pubkey ?? ""],
    queryFn: () => getUserProfile(agent?.pubkey),
    staleTime: 30_000,
  });
  const [displayName, setDisplayName] = React.useState("");
  const [avatarUrl, setAvatarUrl] = React.useState("");
  const [about, setAbout] = React.useState("");
  const [runtimeLabel, setRuntimeLabel] = React.useState("");
  const [isUploading, setIsUploading] = React.useState(false);

  React.useEffect(() => {
    if (!open || !agent || profileQuery.isLoading) return;
    const profile = profileQuery.data;
    setDisplayName(
      presentation?.displayName ?? profile?.displayName ?? agent.name,
    );
    setAvatarUrl(
      presentation?.avatarUrl ?? profile?.avatarUrl ?? agent.avatarUrl ?? "",
    );
    setAbout(presentation?.about ?? profile?.about ?? "");
    setRuntimeLabel(
      presentation?.runtimeLabel ??
        formatExternalAgentRuntimeLabel(agent.agentType) ??
        "",
    );
    setIsUploading(false);
  }, [agent, open, presentation, profileQuery.data, profileQuery.isLoading]);

  if (!agent) return null;

  const save = (nextPresentation: ExternalAgentPresentation | null) => {
    if (!scope) return;
    saveExternalAgentPresentation(scope, agent.pubkey, nextPresentation);
    onOpenChange(false);
  };
  const formDisabled = profileQuery.isLoading || isUploading;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        aria-describedby="external-agent-presentation-description"
        className="max-h-[calc(100vh-2rem)] max-w-3xl overflow-y-auto"
        data-testid="external-agent-presentation-dialog"
      >
        <DialogHeader>
          <DialogTitle>Edit external agent</DialogTitle>
          <DialogDescription id="external-agent-presentation-description">
            Customize this agent&apos;s card and profile in your Buzz app.
            Hermes keeps control of its runtime instructions, Soul, memory,
            provider, skills, and files.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <Badge variant="info">EXTERNAL</Badge>
          {formatExternalAgentRuntimeLabel(runtimeLabel) ? (
            <Badge variant="secondary">
              {formatExternalAgentRuntimeLabel(runtimeLabel)}
            </Badge>
          ) : null}
        </div>

        <div className="grid gap-6 md:grid-cols-[240px_minmax(0,1fr)]">
          <div className="grid content-start gap-2">
            <p className="text-sm font-medium">Agent image</p>
            <ProfileAvatar
              avatarUrl={avatarUrl}
              className="mx-auto mb-2 h-32 w-32 border-[3px] border-background bg-muted"
              iconClassName="h-10 w-10"
              label={displayName.trim() || agent.name}
              testId="external-agent-avatar-preview"
            />
            <ProfileAvatarEditor
              avatarUrl={avatarUrl}
              disabled={formDisabled}
              onUploadedAvatarChange={(url) => {
                if (url) setAvatarUrl(url);
              }}
              onUploadingChange={setIsUploading}
              onUrlChange={setAvatarUrl}
              previewName={displayName.trim() || agent.name}
              testIdPrefix="external-agent-avatar"
            />
          </div>

          <div className="grid content-start gap-5">
            <label
              className="grid gap-2 text-sm font-medium"
              htmlFor="external-agent-display-name"
            >
              Agent name
              <Input
                autoFocus
                data-testid="external-agent-display-name"
                disabled={formDisabled}
                id="external-agent-display-name"
                maxLength={80}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder={agent.name}
                value={displayName}
              />
            </label>

            <label
              className="grid gap-2 text-sm font-medium"
              htmlFor="external-agent-about"
            >
              Card details
              <Textarea
                className="min-h-32 resize-y"
                data-testid="external-agent-about"
                disabled={formDisabled}
                id="external-agent-about"
                maxLength={2_000}
                onChange={(event) => setAbout(event.target.value)}
                placeholder="Describe this agent in Buzz."
                value={about}
              />
              <span className="text-xs font-normal text-muted-foreground">
                This is presentation information in Buzz, not the agent&apos;s
                runtime instructions.
              </span>
            </label>

            <label
              className="grid gap-2 text-sm font-medium"
              htmlFor="external-agent-runtime-label"
            >
              Harness label
              <Input
                data-testid="external-agent-runtime-label"
                disabled={formDisabled}
                id="external-agent-runtime-label"
                maxLength={40}
                onChange={(event) => setRuntimeLabel(event.target.value)}
                placeholder="HERMES"
                value={runtimeLabel}
              />
            </label>
          </div>
        </div>

        {profileQuery.isError ? (
          <p className="text-sm text-destructive">
            The host profile could not be refreshed. Existing Buzz card values
            are still available to edit.
          </p>
        ) : null}

        <DialogFooter>
          <Button
            disabled={formDisabled}
            onClick={() => save(null)}
            type="button"
            variant="ghost"
          >
            Reset
          </Button>
          <Button
            disabled={formDisabled || !displayName.trim()}
            onClick={() =>
              save({
                displayName: displayName.trim(),
                avatarUrl: avatarUrl.trim() || null,
                about: about.trim() || null,
                runtimeLabel: runtimeLabel.trim() || null,
              })
            }
            type="button"
          >
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
