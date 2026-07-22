"use client";

type Props = {
  waitingFor: boolean;
  onWaitingForChange: (value: boolean) => void;
  waitingOn: string;
  onWaitingOnChange: (value: string) => void;
  followUpDate: string;
  onFollowUpDateChange: (value: string) => void;
};

/** "Waiting for" + who + optional follow-up date, shared by every task create/edit form. */
export default function WaitingForFields({
  waitingFor,
  onWaitingForChange,
  waitingOn,
  onWaitingOnChange,
  followUpDate,
  onFollowUpDateChange,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-sm text-zinc-500">
        <input
          type="checkbox"
          checked={waitingFor}
          onChange={(e) => onWaitingForChange(e.target.checked)}
        />
        Waiting for
      </label>
      {waitingFor && (
        <input
          value={waitingOn}
          onChange={(e) => onWaitingOnChange(e.target.value)}
          placeholder="Waiting on who?"
          title="Who this is delegated to — makes 'everything I'm waiting on from X' a real filter"
          className="w-36 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      )}
      {waitingFor && (
        <input
          type="date"
          value={followUpDate}
          onChange={(e) => onFollowUpDateChange(e.target.value)}
          title="Follow up date — actively prompt a nudge on this date instead of just tracking elapsed days"
          className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      )}
    </div>
  );
}
