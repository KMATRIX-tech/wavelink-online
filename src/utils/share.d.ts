import { Post } from '../types';

export const APP_URL: string;

export function getPostUrl(postId?: string): string;

export function downloadPost(post: Partial<Post> & Record<string, any>): Promise<{
  success: boolean;
  message: string;
}>;

export function sharePost(post: Partial<Post> & Record<string, any>): Promise<{
  success: boolean;
  method?: string;
  message: string;
}>;

export function inviteFriends(customMessage?: string): {
  success: boolean;
  message: string;
};
