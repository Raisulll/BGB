import { useRef, useState } from 'react';
import * as messagingApi from '../../api/messaging';
import { errorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useI18n } from '../../i18n/I18nContext';
import { formatDateTime } from '../../utils/helpers';
import Modal from '../ui/Modal';
import Avatar from './Avatar';
import PeoplePicker from './PeoplePicker';

const PHOTO_SIZE = 512;

/**
 * Crops a picture to a centred square and re-encodes it as JPEG. Re-encoding drops the file's
 * metadata (camera, GPS location) before the photo leaves the device.
 */
async function squarePhoto(file) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.min(PHOTO_SIZE, side);
  canvas.getContext('2d').drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', 0.88));
}

/**
 * Group settings. Everyone: members, own pending requests, add people, leave. Admins also:
 * approve/reject requests, remove members, make/unmake admins, rename, change or remove the photo.
 */
export default function GroupDialog({ conversation, myId, onClose, onChanged, onLeft }) {
  const { t, tv } = useI18n();
  const { showToast } = useToast();
  const [view, setView] = useState('main'); // main | add | rename
  const [selected, setSelected] = useState([]);
  const [title, setTitle] = useState(conversation.title);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const isAdmin = conversation.myRole === 'admin';
  const memberIds = conversation.members.map((m) => m.id);
  const requested = conversation.pendingRequests.map((r) => r.user.id);
  const id = conversation.id;

  // Runs one change; the list refreshes from the server afterwards
  const run = async (fn, success) => {
    setBusy(true);
    try {
      const result = await fn();
      const message = typeof success === 'function' ? success(result) : success;
      if (message) showToast(message, 'success');
      onChanged();
      return true;
    } catch (err) {
      showToast(errorMessage(err), 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    const ok = await run(
      () => messagingApi.addMembers(id, selected),
      (r) => (r.added.length ? t('msg.membersAdded', { n: r.added.length }) : t('msg.requestSent', { n: r.requested.length })),
    );
    if (ok) {
      setSelected([]);
      setView('main');
    }
  };

  const rename = async (e) => {
    e.preventDefault();
    if (await run(() => messagingApi.rename(id, title.trim()), t('msg.renamed'))) setView('main');
  };

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let blob;
    try {
      blob = await squarePhoto(file);
    } catch {
      return showToast(t('msg.photoUnreadable'), 'error');
    }
    run(() => messagingApi.setCover(id, blob), t('msg.photoUpdated'));
  };

  const remove = (m) => {
    if (!window.confirm(t('msg.removeConfirm', { name: m.name, group: conversation.title }))) return;
    run(() => messagingApi.removeMember(id, m.id), t('msg.removed', { name: m.name }));
  };

  const leave = async () => {
    if (!window.confirm(t('msg.leaveConfirm', { name: conversation.title }))) return;
    setBusy(true);
    try {
      await messagingApi.leave(id);
      showToast(t('msg.left', { name: conversation.title }), 'success');
      onLeft();
    } catch (err) {
      showToast(errorMessage(err), 'error');
      setBusy(false);
    }
  };

  if (view === 'add') {
    return (
      <Modal open title={t('msg.addPeople')} icon="fa-user-plus" onClose={onClose} busy={busy} maxWidth="max-w-lg">
        <div className="space-y-3">
          {!isAdmin && <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">{t('msg.memberAddNotice')}</p>}
          <PeoplePicker multiple selected={selected} onChange={setSelected} exclude={[...memberIds, ...(isAdmin ? [] : requested)]} disabled={busy} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setView('main')} disabled={busy} className="btn btn-secondary">
              {t('common.cancel')}
            </button>
            <button type="button" onClick={add} disabled={busy || selected.length === 0} className="btn btn-primary">
              {isAdmin ? t('msg.addSelected', { n: selected.length }) : t('msg.requestToAdd', { n: selected.length })}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open title={t('msg.groupSettings')} icon="fa-users" onClose={onClose} busy={busy} maxWidth="max-w-lg">
      <div className="space-y-5">
        {/* Photo and name */}
        <div className="flex flex-col items-center gap-2 text-center">
          <Avatar name={conversation.title} group photoUrl={conversation.coverUrl} size="xl" />
          {view === 'rename' ? (
            <form onSubmit={rename} className="flex w-full max-w-sm flex-col gap-2 sm:flex-row">
              <label htmlFor="group-rename" className="sr-only">
                {t('msg.groupName')}
              </label>
              <input id="group-rename" value={title} onChange={(e) => setTitle(e.target.value)} minLength={2} maxLength={100} required autoFocus className="form-input flex-1" />
              <div className="flex justify-center gap-2">
                <button type="button" onClick={() => (setView('main'), setTitle(conversation.title))} disabled={busy} className="btn btn-secondary btn-sm">
                  {t('common.cancel')}
                </button>
                <button type="submit" disabled={busy || title.trim().length < 2} className="btn btn-primary btn-sm">
                  {t('common.save')}
                </button>
              </div>
            </form>
          ) : (
            <p className="text-base font-semibold text-slate-900">{conversation.title}</p>
          )}
          <p className="text-xs text-slate-500">{t('msg.memberCount', { n: conversation.members.length })}</p>
          {isAdmin && view === 'main' && (
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => setView('rename')} disabled={busy} className="btn btn-secondary btn-sm">
                <i className="fas fa-pen" aria-hidden="true" />
                {t('msg.rename')}
              </button>
              <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="btn btn-secondary btn-sm">
                <i className="fas fa-image" aria-hidden="true" />
                {conversation.coverUrl ? t('msg.changePhoto') : t('msg.addPhoto')}
              </button>
              {conversation.coverUrl && (
                <button type="button" onClick={() => run(() => messagingApi.removeCover(id), t('msg.photoRemoved'))} disabled={busy} className="btn btn-danger-outline btn-sm">
                  {t('msg.removePhoto')}
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={pickPhoto} className="hidden" aria-label={t('msg.changePhoto')} />
            </div>
          )}
        </div>

        {/* Requests waiting for an admin */}
        {conversation.pendingRequests.length > 0 && (
          <section aria-labelledby="group-requests">
            <h3 id="group-requests" className="mb-2 text-sm font-semibold text-slate-900">
              {t('msg.pendingRequests', { n: conversation.pendingRequests.length })}
            </h3>
            <ul className="divide-y divide-slate-100 rounded-md border border-amber-200 bg-amber-50/40">
              {conversation.pendingRequests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <Avatar name={r.user.name} size="sm" />
                  <span className="min-w-40 flex-1 basis-40">
                    <span className="block truncate text-sm font-medium text-slate-900">{r.user.name}</span>
                    <span className="block truncate text-xs text-slate-600">{t('msg.askedBy', { name: r.requestedBy.id === myId ? t('msg.you') : r.requestedBy.name, time: formatDateTime(r.createdAt) })}</span>
                  </span>
                  {isAdmin ? (
                    <span className="ml-11 flex gap-2 sm:ml-0">
                      <button type="button" onClick={() => run(() => messagingApi.rejectRequest(id, r.id), t('msg.rejected'))} disabled={busy} className="btn btn-secondary btn-sm">
                        {t('msg.reject')}
                      </button>
                      <button type="button" onClick={() => run(() => messagingApi.approveRequest(id, r.id), t('msg.approved', { name: r.user.name }))} disabled={busy} className="btn btn-primary btn-sm">
                        {t('msg.approve')}
                      </button>
                    </span>
                  ) : (
                    <span className="text-xs text-amber-900">{t('msg.waitingApproval')}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Members */}
        <section aria-labelledby="group-members">
          <h3 id="group-members" className="mb-2 text-sm font-semibold text-slate-900">
            {t('msg.members')}
          </h3>
          <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200">
            {conversation.members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <Avatar name={m.name} size="sm" />
                <span className="min-w-40 flex-1 basis-40">
                  <span className="flex items-center gap-2 truncate text-sm font-medium text-slate-900">
                    <span className="truncate">
                      {m.name}
                      {m.id === myId && <span className="ml-1 font-normal text-slate-500">({t('msg.you')})</span>}
                    </span>
                    {m.groupRole === 'admin' && <span className="shrink-0 rounded border border-bgb-200 bg-bgb-50 px-1.5 text-[11px] font-semibold text-bgb-800">{t('msg.admin')}</span>}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {tv('role', m.role)} · {m.scope}
                  </span>
                </span>
                {isAdmin && m.id !== myId && (
                  <span className="ml-11 flex gap-2 sm:ml-0">
                    <button
                      type="button"
                      onClick={() =>
                        run(
                          () => messagingApi.setMemberRole(id, m.id, m.groupRole === 'admin' ? 'member' : 'admin'),
                          t(m.groupRole === 'admin' ? 'msg.noLongerAdmin' : 'msg.nowAdmin', { name: m.name }),
                        )
                      }
                      disabled={busy}
                      className="btn btn-secondary btn-sm"
                    >
                      {m.groupRole === 'admin' ? t('msg.removeAdmin') : t('msg.makeAdmin')}
                    </button>
                    <button type="button" onClick={() => remove(m)} disabled={busy} className="btn btn-danger-outline btn-sm">
                      {t('common.remove')}
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">{isAdmin ? t('msg.adminNotice') : t('msg.membersNotice')}</p>
        </section>

        <div className="flex flex-wrap justify-between gap-2">
          <button type="button" onClick={leave} disabled={busy} className="btn btn-danger-outline">
            {t('msg.leaveGroup')}
          </button>
          <button type="button" onClick={() => setView('add')} disabled={busy} className="btn btn-primary">
            <i className="fas fa-user-plus" aria-hidden="true" />
            {t('msg.addPeople')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
