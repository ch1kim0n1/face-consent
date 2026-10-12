export type Link = { label: string; url: string };

export type User = {
  id: string;
  email: string;
  displayName: string | null;
  enrolled: boolean;
  avatarUrl: string | null;
  bannerUrl: string | null;
  links: Link[];
};

export type ConsentPoll = {
  id: string;
  status: "pending" | "accepted" | "rejected" | "expired";
  remainingMs: number;
  profile?: {
    displayName: string | null;
    avatarUrl: string | null;
    bannerUrl: string | null;
    links: Link[];
  };
};

async function parse<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) {
    throw Object.assign(new Error(data.message ?? data.error ?? "Request failed"), {
      status: res.status,
      data,
    });
  }
  return data as T;
}

export const api = {
  async requestMagicLink(email: string) {
    return parse<{ ok: boolean }>(
      await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      }),
    );
  },

  async verifyMagicLink(token: string) {
    return parse<{ ok: boolean; needsDisplayName: boolean; user: User }>(
      await fetch(`/api/auth/verify?token=${encodeURIComponent(token)}`, {
        credentials: "include",
      }),
    );
  },

  async me() {
    return parse<{ user: User }>(await fetch("/api/me", { credentials: "include" }));
  },

  async logout() {
    return parse<{ ok: boolean }>(
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" }),
    );
  },

  async updateProfile(patch: { displayName?: string; links?: Link[] }) {
    return parse<{ user: User }>(
      await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(patch),
      }),
    );
  },

  async enroll(descriptor: number[], avatarBlob: Blob) {
    const form = new FormData();
    form.append("descriptor", JSON.stringify(descriptor));
    form.append("avatar", avatarBlob, "avatar.jpg");
    return parse<{ user: User }>(
      await fetch("/api/me/enroll", {
        method: "POST",
        credentials: "include",
        body: form,
      }),
    );
  },

  async uploadBanner(file: File) {
    const form = new FormData();
    form.append("banner", file);
    return parse<{ user: User }>(
      await fetch("/api/me/banner", { method: "POST", credentials: "include", body: form }),
    );
  },

  async qrToken() {
    return parse<{ token: string }>(
      await fetch("/api/me/qr-token", { credentials: "include" }),
    );
  },

  async publicConfig() {
    return parse<{ vapidPublicKey: string | null }>(await fetch("/api/config/public"));
  },

  async subscribePush(subscription: PushSubscriptionJSON) {
    return parse<{ ok: boolean }>(
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ subscription }),
      }),
    );
  },

  async scanQr(token: string) {
    return parse<{ consent: ConsentPoll }>(
      await fetch("/api/scan/qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token }),
      }),
    );
  },

  async scanFace(descriptor: number[]) {
    return parse<{ consent: ConsentPoll }>(
      await fetch("/api/scan/face", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ descriptor }),
      }),
    );
  },

  async pollConsent(id: string) {
    return parse<ConsentPoll>(
      await fetch(`/api/consent/${id}`, { credentials: "include" }),
    );
  },

  async incomingConsent() {
    return parse<{
      request: {
        id: string;
        scannerDisplayName: string | null;
        remainingMs: number;
      } | null;
    }>(await fetch("/api/consent/incoming", { credentials: "include" }));
  },

  async respondConsent(id: string, action: "accepted" | "rejected") {
    return parse<{ ok: boolean; status: string }>(
      await fetch(`/api/consent/${id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action }),
      }),
    );
  },
};
