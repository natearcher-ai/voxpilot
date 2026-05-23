/**
 * Enterprise SSO — Single Sign-On support for enterprise deployments.
 *
 * Enables organizations to:
 *   - Authenticate users via SAML 2.0 or OIDC providers
 *   - Enforce organization-wide VoxPilot policies
 *   - Manage team vocabulary and voice command packs centrally
 *   - Audit voice usage across the organization
 *   - Control which features are enabled per user/group
 *
 * Configuration is provided via workspace settings or a central config server:
 *   voxpilot.enterprise.ssoProvider: "okta" | "azure-ad" | "google" | "custom"
 *   voxpilot.enterprise.configUrl: "https://config.company.com/voxpilot"
 *   voxpilot.enterprise.orgId: "org-123"
 *
 * Privacy: SSO tokens are stored in VS Code's SecretStorage (OS keychain).
 * No voice data is sent to the SSO provider — auth is separate from transcription.
 *
 * Enable via `voxpilot.enterprise.enabled` setting (default: false).
 */

import * as vscode from 'vscode';

/** Supported SSO providers */
export type SSOProvider = 'okta' | 'azure-ad' | 'google' | 'auth0' | 'custom';

/** SSO configuration */
export interface SSOConfig {
  /** SSO provider type */
  provider: SSOProvider;
  /** Organization ID */
  orgId: string;
  /** OIDC discovery URL or SAML metadata URL */
  discoveryUrl?: string;
  /** Client ID for OIDC */
  clientId?: string;
  /** Custom authorization endpoint */
  authEndpoint?: string;
  /** Custom token endpoint */
  tokenEndpoint?: string;
  /** Scopes to request */
  scopes: string[];
  /** Whether to enforce SSO (block usage without auth) */
  enforced: boolean;
}

/** Authenticated user info */
export interface SSOUser {
  /** User ID from the identity provider */
  id: string;
  /** Display name */
  name: string;
  /** Email address */
  email: string;
  /** Organization ID */
  orgId: string;
  /** Groups/roles from the IdP */
  groups: string[];
  /** Token expiry timestamp */
  expiresAt: number;
  /** Whether the session is active */
  authenticated: boolean;
}

/** Organization policy (fetched from config server) */
export interface OrgPolicy {
  /** Organization display name */
  orgName: string;
  /** Features that are force-enabled */
  enabledFeatures: string[];
  /** Features that are force-disabled */
  disabledFeatures: string[];
  /** Whether cloud features (LLM) are allowed */
  allowCloudFeatures: boolean;
  /** Whether telemetry is allowed */
  allowTelemetry: boolean;
  /** Custom vocabulary packs to auto-install */
  vocabularyPacks: string[];
  /** Maximum transcript retention days (0 = org decides) */
  maxRetentionDays: number;
  /** Whether users can override org settings */
  allowUserOverrides: boolean;
}

/** SSO authentication state */
export interface AuthState {
  /** Whether SSO is configured */
  configured: boolean;
  /** Whether the user is authenticated */
  authenticated: boolean;
  /** Current user info (if authenticated) */
  user?: SSOUser;
  /** Organization policy (if fetched) */
  policy?: OrgPolicy;
  /** Last error message */
  error?: string;
}

/** Default empty state */
const EMPTY_STATE: AuthState = {
  configured: false,
  authenticated: false,
};

/**
 * Enterprise SSO manager — handles authentication and policy enforcement.
 */
export class EnterpriseSSOManager {
  private state: AuthState = { ...EMPTY_STATE };
  private config: SSOConfig | null = null;
  private context: vscode.ExtensionContext | undefined;
  private onAuthChangeCallbacks: ((state: AuthState) => void)[] = [];

  /** Initialize with extension context */
  init(extensionContext: vscode.ExtensionContext): void {
    this.context = extensionContext;
    this.loadConfig();
  }

  /** Get current authentication state */
  getState(): AuthState {
    return { ...this.state };
  }

  /** Check if SSO is configured */
  isConfigured(): boolean {
    return this.state.configured;
  }

  /** Check if user is authenticated */
  isAuthenticated(): boolean {
    return this.state.authenticated && !this.isExpired();
  }

  /** Get current user */
  getUser(): SSOUser | undefined {
    return this.state.user;
  }

  /** Get organization policy */
  getPolicy(): OrgPolicy | undefined {
    return this.state.policy;
  }

  /** Check if a feature is allowed by org policy */
  isFeatureAllowed(featureId: string): boolean {
    if (!this.state.policy) return true; // No policy = everything allowed
    if (this.state.policy.disabledFeatures.includes(featureId)) return false;
    return true;
  }

  /** Check if a feature is force-enabled by org policy */
  isFeatureRequired(featureId: string): boolean {
    if (!this.state.policy) return false;
    return this.state.policy.enabledFeatures.includes(featureId);
  }

  /** Start the SSO login flow */
  async login(): Promise<boolean> {
    if (!this.config) {
      this.state.error = 'SSO not configured';
      return false;
    }

    try {
      // Use VS Code's authentication API for OIDC
      const session = await vscode.authentication.getSession(
        this.getProviderId(),
        this.config.scopes,
        { createIfNone: true },
      );

      if (session) {
        this.state.user = {
          id: session.account.id,
          name: session.account.label,
          email: session.account.label, // May need extraction from token
          orgId: this.config.orgId,
          groups: [],
          expiresAt: Date.now() + 3600000, // 1 hour default
          authenticated: true,
        };
        this.state.authenticated = true;
        this.state.error = undefined;

        // Fetch org policy
        await this.fetchPolicy();

        this.notifyAuthChange();
        this.saveState();
        return true;
      }
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : 'Authentication failed';
      this.state.authenticated = false;
    }

    this.notifyAuthChange();
    return false;
  }

  /** Logout and clear session */
  async logout(): Promise<void> {
    this.state.user = undefined;
    this.state.authenticated = false;
    this.state.policy = undefined;
    this.state.error = undefined;

    // Clear stored token
    if (this.context) {
      await this.context.secrets.delete('voxpilot-sso-token');
    }

    this.notifyAuthChange();
    this.saveState();
  }

  /** Register a callback for auth state changes */
  onAuthChange(callback: (state: AuthState) => void): vscode.Disposable {
    this.onAuthChangeCallbacks.push(callback);
    return {
      dispose: () => {
        const idx = this.onAuthChangeCallbacks.indexOf(callback);
        if (idx >= 0) this.onAuthChangeCallbacks.splice(idx, 1);
      },
    };
  }

  /** Check if the current session is expired */
  isExpired(): boolean {
    if (!this.state.user) return true;
    return Date.now() > this.state.user.expiresAt;
  }

  /** Refresh the session if expired */
  async refreshIfNeeded(): Promise<boolean> {
    if (!this.isExpired()) return true;
    return this.login();
  }

  /** Get SSO status summary for display */
  getStatusSummary(): string {
    if (!this.state.configured) return 'SSO not configured';
    if (!this.state.authenticated) return 'Not authenticated';
    if (this.isExpired()) return 'Session expired';
    return `${this.state.user?.name} (${this.state.user?.orgId})`;
  }

  private getProviderId(): string {
    switch (this.config?.provider) {
      case 'azure-ad': return 'microsoft';
      case 'google': return 'google';
      case 'okta': return 'okta';
      case 'auth0': return 'auth0';
      default: return 'voxpilot-sso';
    }
  }

  private async fetchPolicy(): Promise<void> {
    // In production, this would fetch from the org's config server
    // For now, use workspace settings as the policy source
    const config = vscode.workspace.getConfiguration('voxpilot.enterprise');
    this.state.policy = {
      orgName: config.get<string>('orgName', 'Unknown Organization'),
      enabledFeatures: config.get<string[]>('enabledFeatures', []),
      disabledFeatures: config.get<string[]>('disabledFeatures', []),
      allowCloudFeatures: config.get<boolean>('allowCloudFeatures', true),
      allowTelemetry: config.get<boolean>('allowTelemetry', false),
      vocabularyPacks: config.get<string[]>('vocabularyPacks', []),
      maxRetentionDays: config.get<number>('maxRetentionDays', 30),
      allowUserOverrides: config.get<boolean>('allowUserOverrides', true),
    };
  }

  private loadConfig(): void {
    const config = vscode.workspace.getConfiguration('voxpilot.enterprise');
    const enabled = config.get<boolean>('enabled', false);

    if (!enabled) {
      this.state = { ...EMPTY_STATE };
      return;
    }

    const provider = config.get<SSOProvider>('ssoProvider', 'custom');
    const orgId = config.get<string>('orgId', '');

    if (!orgId) {
      this.state = { configured: false, authenticated: false, error: 'Missing orgId' };
      return;
    }

    this.config = {
      provider,
      orgId,
      discoveryUrl: config.get<string>('discoveryUrl'),
      clientId: config.get<string>('clientId'),
      authEndpoint: config.get<string>('authEndpoint'),
      tokenEndpoint: config.get<string>('tokenEndpoint'),
      scopes: config.get<string[]>('scopes', ['openid', 'profile', 'email']),
      enforced: config.get<boolean>('enforced', false),
    };

    this.state.configured = true;
    this.loadState();
  }

  private notifyAuthChange(): void {
    for (const cb of this.onAuthChangeCallbacks) {
      try { cb(this.state); } catch { /* swallow */ }
    }
  }

  private loadState(): void {
    if (!this.context) return;
    const saved = this.context.globalState.get<{ user?: SSOUser }>('voxpilot-sso');
    if (saved?.user && saved.user.expiresAt > Date.now()) {
      this.state.user = saved.user;
      this.state.authenticated = true;
    }
  }

  private saveState(): void {
    if (!this.context) return;
    this.context.globalState.update('voxpilot-sso', {
      user: this.state.user,
    });
  }
}

/** Singleton instance */
export const enterpriseSSO = new EnterpriseSSOManager();
