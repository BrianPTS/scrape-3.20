'use server';

import dbConnect from '@/lib/dbConnect';
import { SchedulerSettings } from '@/models/schedulerModel';
import { revalidatePath } from 'next/cache';

export async function getOfferNameExclusions(): Promise<{ success: boolean; exclusions: string[]; error?: string }> {
  try {
    await dbConnect();
    const settings = await (SchedulerSettings as any).getSettings();
    const list: string[] = Array.isArray(settings.offerNameExclusions)
      ? settings.offerNameExclusions
      : [];
    return { success: true, exclusions: list };
  } catch (err) {
    return { success: false, exclusions: [], error: (err as Error).message };
  }
}

export async function addOfferNameExclusion(term: string): Promise<{ success: boolean; exclusions: string[]; error?: string }> {
  try {
    const t = (term || '').trim();
    if (!t) return { success: false, exclusions: [], error: 'Empty term' };
    if (t.length > 200) return { success: false, exclusions: [], error: 'Term too long (200 char max)' };

    await dbConnect();
    const settings = await (SchedulerSettings as any).getSettings();
    const current: string[] = Array.isArray(settings.offerNameExclusions) ? settings.offerNameExclusions : [];

    if (current.some(x => x.toLowerCase() === t.toLowerCase())) {
      return { success: true, exclusions: current };
    }

    const next = [...current, t];
    settings.offerNameExclusions = next;
    settings.updatedAt = new Date();
    await settings.save();

    revalidatePath('/dashboard/export-csv');
    return { success: true, exclusions: next };
  } catch (err) {
    return { success: false, exclusions: [], error: (err as Error).message };
  }
}

export async function removeOfferNameExclusion(term: string): Promise<{ success: boolean; exclusions: string[]; error?: string }> {
  try {
    await dbConnect();
    const settings = await (SchedulerSettings as any).getSettings();
    const current: string[] = Array.isArray(settings.offerNameExclusions) ? settings.offerNameExclusions : [];
    const next = current.filter(x => x.toLowerCase() !== (term || '').toLowerCase());

    settings.offerNameExclusions = next;
    settings.updatedAt = new Date();
    await settings.save();

    revalidatePath('/dashboard/export-csv');
    return { success: true, exclusions: next };
  } catch (err) {
    return { success: false, exclusions: [], error: (err as Error).message };
  }
}
