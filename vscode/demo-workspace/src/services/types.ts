// Shared types for the demo project.

export interface User {
  id: string;
  email: string;
  createdAt: Date;
}

export interface Session {
  token: string;
  user: User;
  expiresAt: Date;
}
