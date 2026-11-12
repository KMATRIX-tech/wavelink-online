import { Post } from '../types';

export const APP_URL: string;

export function downloadPost(post: Partial<Post> | any): Promise<{ success: boolean; message: string }>;

export function sharePost(post: Partial<Post> | any): Promise<{ success: boolean; method: string }>;

export function inviteFriends(customMessage?: string): Promise<{ success: boolean; method: string }>;

export function getPostShareUrl(postOrId: Partial<Post> | string | any): string;

export function sharePostToPlatform(
  platform:
    | 'whatsapp'
    | 'telegram'
    | 'facebook'
    | 'x'
    | 'messenger'
    | 'instagram'
    | 'reddit'
    | 'sms'
    | 'more',
  post: Partial<Post> | any
): Promise<{ success: boolean; method: string; copiedFallback?: boolean }>;

