"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidationHttpError = void 0;
exports.normalizeEntity = normalizeEntity;
exports.apiCatalog = apiCatalog;
exports.handleGet = handleGet;
exports.handlePost = handlePost;
exports.handlePatch = handlePatch;
exports.handleDelete = handleDelete;
const firestore_1 = require("firebase-admin/firestore");
const httpUtil_js_1 = require("./httpUtil.js");
const db = (0, firestore_1.getFirestore)();
const TASK_STATUSES = ['todo', 'doing', 'done', 'blocked'];
const PRIORITIES = ['high', 'medium', 'low'];
const PROJECT_STATUSES = ['active', 'paused', 'done'];
const PROJECT_KINDS = ['client', 'internal'];
const PROJECT_BILLING = ['one-time', 'retainer'];
const LEAD_STATUSES = [
    'new',
    'specification',
    'quote_sent',
    'follow_up',
    'no_answer',
    'not_relevant',
    'closed',
];
const CLIENT_STATUSES = ['active', 'inactive'];
const CAMPAIGN_KINDS = ['internal', 'client'];
const CAMPAIGN_PLATFORMS = [
    'instagram',
    'google_ads',
    'facebook',
    'tiktok',
    'linkedin',
    'other',
];
const CAMPAIGN_STATUSES = ['planning', 'active', 'paused', 'completed'];
const INVOICE_STATUSES = ['pending', 'paid', 'overdue'];
const DEAL_KINDS = ['retainer_monthly', 'retainer_yearly', 'one_time'];
const DEAL_STATUSES = ['active', 'completed', 'cancelled'];
const DOC_TYPES = ['spec', 'meeting', 'brief', 'note'];
const TASK_RECURRENCE = ['daily', 'weekly'];
const COLLECTION_ALIASES = {
    tasks: 'tasks',
    projects: 'projects',
    leads: 'leads',
    clients: 'clients',
    suppliers: 'suppliers',
    campaigns: 'campaigns',
    meetings: 'meetings',
    invoices: 'invoices',
    deals: 'deals',
    collectiontracking: 'collectionTracking',
    hostingrecords: 'hostingRecords',
    docs: 'docs',
    recurringtasktemplates: 'recurringTaskTemplates',
    agentcommissionpayments: 'agentCommissionPayments',
    domainrecords: 'domainRecords',
    users: 'users',
    activitylogs: 'activityLogs',
};
const READ_ONLY = new Set(['users']);
function normalizeEntity(raw) {
    const k = raw.trim().toLowerCase().replace(/_/g, '');
    return k in COLLECTION_ALIASES ? k : null;
}
function apiCatalog() {
    return {
        version: 2,
        auth: {
            headers: ['X-Hub-Api-Key', 'Authorization: Bearer <key>'],
        },
        routing: {
            entity: 'query entity (or legacy resource)',
            id: 'GET/PATCH/DELETE single doc',
            limit: 'GET list max 200',
            filters: 'status, clientId, projectId, assigneeId, ownerId, q',
            sub: 'POST tasks notes: sub=notes&id=<taskId>',
            meta: 'GET ?meta=schema',
        },
        entities: Object.keys(COLLECTION_ALIASES).filter((e) => e !== 'users' || true),
        methods: {
            GET: 'list or get by id; ?meta=schema',
            POST: 'create — body { data, actor: { userId, userName? } }',
            PATCH: 'update — body { data, actor? }',
            PUT: 'same as PATCH',
            DELETE: 'delete by id (not collectionTracking)',
        },
        excluded: ['passwords_vault', 'attendanceConfig'],
    };
}
async function resolveActorName(actor) {
    if (actor.userName?.trim())
        return actor.userName.trim();
    const snap = await db.doc(`users/${actor.userId}`).get();
    const n = snap.get('name');
    if (typeof n === 'string' && n.trim())
        return n.trim();
    const em = snap.get('email');
    if (typeof em === 'string' && em.includes('@'))
        return em.split('@')[0] ?? 'משתמש';
    return 'משתמש';
}
function actorFields(actor, uname) {
    return {
        lastActorUserId: actor.userId,
        lastActorUserName: uname,
        lastEventByUserId: actor.userId,
        lastEventByUserName: uname,
    };
}
function applyListFilters(items, query) {
    let out = items;
    const status = query.status?.trim();
    if (status)
        out = out.filter((i) => String(i.status ?? '').toLowerCase() === status.toLowerCase());
    for (const key of ['clientId', 'projectId', 'assigneeId', 'ownerId']) {
        const v = query[key]?.trim();
        if (v)
            out = out.filter((i) => String(i[key] ?? '') === v);
    }
    const q = query.q?.trim().toLowerCase();
    if (q) {
        out = out.filter((i) => {
            const hay = [
                i.name,
                i.title,
                i.company,
                i.email,
                i.domain,
                i.description,
            ]
                .filter((x) => typeof x === 'string')
                .join(' ')
                .toLowerCase();
            return hay.includes(q);
        });
    }
    return out;
}
// ——— validators / builders ———
function validateTaskCreate(data, actor) {
    if (!actor?.userId)
        return (0, httpUtil_js_1.failErrors)(['actor.userId — חובה ליצירת משימה (מזהה משתמש Firebase)']);
    const errors = (0, httpUtil_js_1.mergeErrors)((0, httpUtil_js_1.requireString)(data, 'title', 'title'), (0, httpUtil_js_1.requireString)(data, 'assigneeId', 'assigneeId'), (0, httpUtil_js_1.requireYmd)(data, 'dueDate', 'dueDate'));
    if (errors.length)
        return (0, httpUtil_js_1.failErrors)(errors);
    const status = (0, httpUtil_js_1.optionalString)(data, 'status');
    if (status && !TASK_STATUSES.includes(status)) {
        return (0, httpUtil_js_1.failErrors)([`status — חייב: ${TASK_STATUSES.join(', ')}`]);
    }
    const priority = (0, httpUtil_js_1.optionalString)(data, 'priority');
    if (priority && !PRIORITIES.includes(priority)) {
        return (0, httpUtil_js_1.failErrors)([`priority — חייב: ${PRIORITIES.join(', ')}`]);
    }
    return (0, httpUtil_js_1.okData)(data);
}
function buildTaskCreate(data, actor, uname) {
    return (0, httpUtil_js_1.stripUndefined)({
        title: String(data.title).trim(),
        description: (0, httpUtil_js_1.optionalString)(data, 'description') ?? '',
        status: (0, httpUtil_js_1.optionalString)(data, 'status') ?? 'todo',
        priority: (0, httpUtil_js_1.optionalString)(data, 'priority') ?? 'medium',
        assigneeId: String(data.assigneeId).trim(),
        clientId: (0, httpUtil_js_1.optionalString)(data, 'clientId') ?? null,
        projectId: (0, httpUtil_js_1.optionalString)(data, 'projectId') ?? null,
        supplierId: (0, httpUtil_js_1.optionalString)(data, 'supplierId') ?? null,
        dueDate: String(data.dueDate).slice(0, 10),
        ...((0, httpUtil_js_1.optionalString)(data, 'dueTime') ? { dueTime: (0, httpUtil_js_1.optionalString)(data, 'dueTime') } : {}),
        reminderDate: (0, httpUtil_js_1.optionalString)(data, 'reminderDate') ?? null,
        tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
        reminders: Array.isArray(data.reminders) ? data.reminders : [],
        sharedWithUserIds: Array.isArray(data.sharedWithUserIds)
            ? data.sharedWithUserIds.map(String)
            : [],
        shared: false,
        createdBy: actor.userId,
        ...actorFields(actor, uname),
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
}
function validateProjectCreate(data) {
    const errors = (0, httpUtil_js_1.mergeErrors)((0, httpUtil_js_1.requireString)(data, 'name', 'name'), (0, httpUtil_js_1.requireString)(data, 'ownerId', 'ownerId'), (0, httpUtil_js_1.requireYmd)(data, 'dueDate', 'dueDate'));
    if (errors.length)
        return (0, httpUtil_js_1.failErrors)(errors);
    const kindRaw = (data.type ?? data.projectKind);
    const kind = typeof kindRaw === 'string' && PROJECT_KINDS.includes(kindRaw)
        ? kindRaw
        : 'client';
    if (kind === 'client' && !(0, httpUtil_js_1.optionalString)(data, 'clientId')) {
        return (0, httpUtil_js_1.failErrors)(['clientId — חובה לפרויקט מסוג client']);
    }
    return (0, httpUtil_js_1.okData)({ ...data, type: kind });
}
function buildProjectCreate(data) {
    const kind = data.type === 'internal' || data.projectKind === 'internal' ? 'internal' : 'client';
    const billing = data.projectType === 'retainer' ? 'retainer' : 'one-time';
    const doc = {
        name: String(data.name).trim(),
        projectKind: kind,
        status: (0, httpUtil_js_1.optionalString)(data, 'status') ?? 'active',
        priority: (0, httpUtil_js_1.optionalString)(data, 'priority') ?? 'medium',
        ownerId: String(data.ownerId).trim(),
        color: (0, httpUtil_js_1.optionalString)(data, 'color') ?? '#6366f1',
        taskCount: 0,
        doneCount: 0,
        projectType: billing,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    };
    if (billing === 'retainer') {
        const sd = (0, httpUtil_js_1.optionalString)(data, 'startDate')?.slice(0, 10) ?? '';
        doc.startDate = sd;
        doc.dueDate = sd || String(data.dueDate).slice(0, 10);
        doc.retainerLog = Array.isArray(data.retainerLog) ? data.retainerLog : [];
    }
    else {
        doc.dueDate = String(data.dueDate).slice(0, 10);
    }
    const cid = (0, httpUtil_js_1.optionalString)(data, 'clientId');
    if (cid)
        doc.clientId = cid;
    const sid = (0, httpUtil_js_1.optionalString)(data, 'supplierId');
    if (sid)
        doc.supplierId = sid;
    const desc = (0, httpUtil_js_1.optionalString)(data, 'description');
    if (desc)
        doc.description = desc;
    return doc;
}
function validateLeadCreate(data, actor) {
    if (!actor?.userId)
        return (0, httpUtil_js_1.failErrors)(['actor.userId — חובה ליצירת ליד']);
    const errors = (0, httpUtil_js_1.mergeErrors)((0, httpUtil_js_1.requireString)(data, 'name', 'name'), (0, httpUtil_js_1.requireString)(data, 'ownerId', 'ownerId'));
    if (errors.length)
        return (0, httpUtil_js_1.failErrors)(errors);
    const st = (0, httpUtil_js_1.optionalString)(data, 'status') ?? 'new';
    if (!LEAD_STATUSES.includes(st)) {
        return (0, httpUtil_js_1.failErrors)([`status — חייב: ${LEAD_STATUSES.join(', ')}`]);
    }
    if (st === 'not_relevant' && !(0, httpUtil_js_1.optionalString)(data, 'notRelevantReason')) {
        return (0, httpUtil_js_1.failErrors)(['notRelevantReason — חובה כש-status הוא not_relevant']);
    }
    return (0, httpUtil_js_1.okData)(data);
}
function buildLeadCreate(data, actor, uname) {
    return (0, httpUtil_js_1.stripUndefined)({
        name: String(data.name).trim(),
        status: (0, httpUtil_js_1.optionalString)(data, 'status') ?? 'new',
        ownerId: String(data.ownerId).trim(),
        company: (0, httpUtil_js_1.optionalString)(data, 'company'),
        phone: (0, httpUtil_js_1.optionalString)(data, 'phone'),
        email: (0, httpUtil_js_1.optionalString)(data, 'email'),
        clientId: (0, httpUtil_js_1.optionalString)(data, 'clientId'),
        source: (0, httpUtil_js_1.optionalString)(data, 'source'),
        clientNeeds: (0, httpUtil_js_1.optionalString)(data, 'clientNeeds'),
        salesAgentUserId: (0, httpUtil_js_1.optionalString)(data, 'salesAgentUserId'),
        notRelevantReason: (0, httpUtil_js_1.optionalString)(data, 'notRelevantReason'),
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        createdByUserId: actor.userId,
        createdByUserName: uname,
        ...actorFields(actor, uname),
    });
}
function validateClientCreate(data, actor) {
    if (!actor?.userId)
        return (0, httpUtil_js_1.failErrors)(['actor.userId — חובה ליצירת לקוח']);
    const errors = (0, httpUtil_js_1.mergeErrors)((0, httpUtil_js_1.requireString)(data, 'name', 'name'), (0, httpUtil_js_1.requireString)(data, 'contact', 'contact'), (0, httpUtil_js_1.requireString)(data, 'phone', 'phone'), (0, httpUtil_js_1.requireString)(data, 'email', 'email'));
    if (errors.length)
        return (0, httpUtil_js_1.failErrors)(errors);
    return (0, httpUtil_js_1.okData)(data);
}
function buildClientCreate(data, actor, uname) {
    return (0, httpUtil_js_1.stripUndefined)({
        name: String(data.name).trim(),
        contact: String(data.contact).trim(),
        phone: String(data.phone).trim(),
        email: String(data.email).trim(),
        status: (0, httpUtil_js_1.optionalString)(data, 'status') ?? 'active',
        department: data.department ?? null,
        salesAgentUserId: (0, httpUtil_js_1.optionalString)(data, 'salesAgentUserId'),
        legalName: (0, httpUtil_js_1.optionalString)(data, 'legalName'),
        taxId: (0, httpUtil_js_1.optionalString)(data, 'taxId'),
        addressLine: (0, httpUtil_js_1.optionalString)(data, 'addressLine'),
        city: (0, httpUtil_js_1.optionalString)(data, 'city'),
        businessNotes: (0, httpUtil_js_1.optionalString)(data, 'businessNotes'),
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        createdByUserId: actor.userId,
        createdByUserName: uname,
        ...actorFields(actor, uname),
    });
}
function validateSupplierCreate(data, actor) {
    if (!actor?.userId)
        return (0, httpUtil_js_1.failErrors)(['actor.userId — חובה ליצירת ספק']);
    const errors = (0, httpUtil_js_1.mergeErrors)((0, httpUtil_js_1.requireString)(data, 'name', 'name'), (0, httpUtil_js_1.requireString)(data, 'phone', 'phone'), (0, httpUtil_js_1.requireString)(data, 'email', 'email'));
    if (errors.length)
        return (0, httpUtil_js_1.failErrors)(errors);
    return (0, httpUtil_js_1.okData)(data);
}
function buildSupplierCreate(data, actor, uname) {
    const types = Array.isArray(data.supplierTypes) ? data.supplierTypes.map(String) : [];
    return (0, httpUtil_js_1.stripUndefined)({
        name: String(data.name).trim(),
        phone: String(data.phone).trim(),
        email: String(data.email).trim(),
        ...(types.length ? { supplierTypes: types } : {}),
        active: data.active !== false,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        createdByUserId: actor.userId,
        createdByUserName: uname,
        ...actorFields(actor, uname),
    });
}
function validateCampaignCreate(data, actor) {
    if (!actor?.userId)
        return (0, httpUtil_js_1.failErrors)(['actor.userId — חובה ליצירת קמפיין']);
    const errors = (0, httpUtil_js_1.mergeErrors)((0, httpUtil_js_1.requireString)(data, 'name', 'name'), (0, httpUtil_js_1.requireEnum)(data, 'kind', CAMPAIGN_KINDS, 'kind'), (0, httpUtil_js_1.requireEnum)(data, 'platform', CAMPAIGN_PLATFORMS, 'platform'), (0, httpUtil_js_1.requireEnum)(data, 'status', CAMPAIGN_STATUSES, 'status'));
    if (errors.length)
        return (0, httpUtil_js_1.failErrors)(errors);
    return (0, httpUtil_js_1.okData)(data);
}
function buildCampaignCreate(data, actor, uname) {
    return (0, httpUtil_js_1.stripUndefined)({
        name: String(data.name).trim(),
        kind: data.kind,
        platform: data.platform,
        status: data.status,
        clientId: (0, httpUtil_js_1.optionalString)(data, 'clientId'),
        projectId: (0, httpUtil_js_1.optionalString)(data, 'projectId'),
        supplierId: (0, httpUtil_js_1.optionalString)(data, 'supplierId'),
        performerUserId: (0, httpUtil_js_1.optionalString)(data, 'performerUserId'),
        budget: typeof data.budget === 'number' ? data.budget : undefined,
        startDate: (0, httpUtil_js_1.optionalString)(data, 'startDate'),
        endDate: (0, httpUtil_js_1.optionalString)(data, 'endDate'),
        resultsUpdate: (0, httpUtil_js_1.optionalString)(data, 'resultsUpdate'),
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        createdByUserId: actor.userId,
        createdByUserName: uname,
        ...actorFields(actor, uname),
    });
}
function validateMeetingCreate(data, actor) {
    if (!actor?.userId)
        return (0, httpUtil_js_1.failErrors)(['actor.userId — חובה ליצירת פגישה']);
    const errors = (0, httpUtil_js_1.mergeErrors)((0, httpUtil_js_1.requireString)(data, 'title', 'title'), (0, httpUtil_js_1.requireString)(data, 'purpose', 'purpose'), (0, httpUtil_js_1.requireString)(data, 'agenda', 'agenda'), (0, httpUtil_js_1.requireYmd)(data, 'startDate', 'startDate'), (0, httpUtil_js_1.requireString)(data, 'organizerUserId', 'organizerUserId'));
    if (errors.length)
        return (0, httpUtil_js_1.failErrors)(errors);
    if (!Array.isArray(data.participantUserIds)) {
        return (0, httpUtil_js_1.failErrors)(['participantUserIds — חובה מערך (אפשר ריק)']);
    }
    return (0, httpUtil_js_1.okData)(data);
}
function buildMeetingCreate(data, actor) {
    const participants = data.participantUserIds.map(String);
    const organizer = String(data.organizerUserId).trim();
    const exclude = data.excludeCreatorFromAttendees === true;
    const attendeeSet = new Set();
    if (!exclude)
        attendeeSet.add(actor.userId);
    attendeeSet.add(organizer);
    for (const p of participants)
        if (p.trim())
            attendeeSet.add(p.trim());
    return (0, httpUtil_js_1.stripUndefined)({
        title: String(data.title).trim(),
        purpose: String(data.purpose).trim(),
        agenda: String(data.agenda).trim(),
        startDate: String(data.startDate).slice(0, 10),
        startTime: (0, httpUtil_js_1.optionalString)(data, 'startTime'),
        endTime: (0, httpUtil_js_1.optionalString)(data, 'endTime'),
        location: (0, httpUtil_js_1.optionalString)(data, 'location'),
        clientId: (0, httpUtil_js_1.optionalString)(data, 'clientId'),
        projectId: (0, httpUtil_js_1.optionalString)(data, 'projectId'),
        supplierId: (0, httpUtil_js_1.optionalString)(data, 'supplierId'),
        leadId: (0, httpUtil_js_1.optionalString)(data, 'leadId'),
        organizerUserId: organizer,
        participantUserIds: participants,
        attendeeUserIds: [...attendeeSet],
        excludeCreatorFromAttendees: exclude,
        createdBy: actor.userId,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
}
function validateInvoiceCreate(data) {
    const errors = (0, httpUtil_js_1.mergeErrors)((0, httpUtil_js_1.requireString)(data, 'clientId', 'clientId'), (0, httpUtil_js_1.requireString)(data, 'invoiceNumber', 'invoiceNumber'), (0, httpUtil_js_1.requireNumber)(data, 'amount', 'amount', 0), (0, httpUtil_js_1.requireYmd)(data, 'dueDate', 'dueDate'));
    if (errors.length)
        return (0, httpUtil_js_1.failErrors)(errors);
    return (0, httpUtil_js_1.okData)(data);
}
function buildInvoiceCreate(data) {
    const isPaid = data.status === 'paid' || data.initialStatus === 'paid';
    const row = {
        clientId: String(data.clientId).trim(),
        invoiceNumber: String(data.invoiceNumber).trim(),
        amount: Number(data.amount),
        dueDate: String(data.dueDate).slice(0, 10),
        status: isPaid ? 'paid' : (0, httpUtil_js_1.optionalString)(data, 'status') ?? 'pending',
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    };
    if (isPaid)
        row.paidDate = (0, httpUtil_js_1.optionalString)(data, 'paidDate')?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
    if ((0, httpUtil_js_1.optionalString)(data, 'note'))
        row.note = (0, httpUtil_js_1.optionalString)(data, 'note');
    if ((0, httpUtil_js_1.optionalString)(data, 'dealId'))
        row.dealId = (0, httpUtil_js_1.optionalString)(data, 'dealId');
    if (typeof data.agentCommissionPercent === 'number') {
        const p = Math.round(data.agentCommissionPercent);
        if (p >= 0 && p <= 100)
            row.agentCommissionPercent = p;
    }
    return row;
}
function validateDealCreate(data, actor) {
    if (!actor?.userId)
        return (0, httpUtil_js_1.failErrors)(['actor.userId — חובה ליצירת עסקה']);
    const errors = (0, httpUtil_js_1.mergeErrors)((0, httpUtil_js_1.requireString)(data, 'clientId', 'clientId'), (0, httpUtil_js_1.requireEnum)(data, 'dealKind', DEAL_KINDS, 'dealKind'), (0, httpUtil_js_1.requireString)(data, 'title', 'title'), (0, httpUtil_js_1.requireNumber)(data, 'commissionPercent', 'commissionPercent', 0));
    if (errors.length)
        return (0, httpUtil_js_1.failErrors)(errors);
    return (0, httpUtil_js_1.okData)(data);
}
function buildDealCreate(data, actor) {
    const comm = Math.min(100, Math.max(0, Math.round(Number(data.commissionPercent))));
    return (0, httpUtil_js_1.stripUndefined)({
        clientId: String(data.clientId).trim(),
        dealKind: data.dealKind,
        title: String(data.title).trim(),
        commissionPercent: comm,
        status: (0, httpUtil_js_1.optionalString)(data, 'status') ?? 'active',
        leadId: (0, httpUtil_js_1.optionalString)(data, 'leadId'),
        salesAgentUserId: (0, httpUtil_js_1.optionalString)(data, 'salesAgentUserId'),
        agreedAmount: typeof data.agreedAmount === 'number' ? data.agreedAmount : undefined,
        notes: (0, httpUtil_js_1.optionalString)(data, 'notes'),
        expectedPaymentYmd: (0, httpUtil_js_1.optionalString)(data, 'expectedPaymentYmd'),
        annualBillingYmd: (0, httpUtil_js_1.optionalString)(data, 'annualBillingYmd'),
        firstPaymentYmd: (0, httpUtil_js_1.optionalString)(data, 'firstPaymentYmd'),
        isHostingDeal: data.isHostingDeal === true ? true : undefined,
        scheduledPayments: Array.isArray(data.scheduledPayments) ? data.scheduledPayments : undefined,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
        createdByUserId: actor.userId,
    });
}
function validateCollectionTrackingUpsert(data) {
    const errors = (0, httpUtil_js_1.mergeErrors)((0, httpUtil_js_1.requireString)(data, 'clientId', 'clientId'), (0, httpUtil_js_1.requireYmd)(data, 'lastRequestDate', 'lastRequestDate'), (0, httpUtil_js_1.requireYmd)(data, 'dueDate', 'dueDate'));
    if (errors.length)
        return (0, httpUtil_js_1.failErrors)(errors);
    return (0, httpUtil_js_1.okData)(data);
}
function validateHostingCreate(data) {
    const errors = (0, httpUtil_js_1.mergeErrors)((0, httpUtil_js_1.requireString)(data, 'clientId', 'clientId'), (0, httpUtil_js_1.requireString)(data, 'domain', 'domain'));
    if (errors.length)
        return (0, httpUtil_js_1.failErrors)(errors);
    return (0, httpUtil_js_1.okData)(data);
}
function buildHostingDoc(data) {
    const fields = [
        'clientId',
        'domain',
        'server',
        'serverLocation',
        'controlPanel',
        'username',
        'ipAddress',
        'sslExpiry',
        'domainExpiry',
        'platform',
        'phpVersion',
        'notes',
    ];
    const o = {};
    for (const f of fields) {
        if (data[f] !== undefined)
            o[f] = data[f];
    }
    return o;
}
function validateDocCreate(data) {
    const errors = (0, httpUtil_js_1.mergeErrors)((0, httpUtil_js_1.requireString)(data, 'projectId', 'projectId'), (0, httpUtil_js_1.requireString)(data, 'title', 'title'), (0, httpUtil_js_1.requireEnum)(data, 'type', DOC_TYPES, 'type'), (0, httpUtil_js_1.requireString)(data, 'content', 'content'), (0, httpUtil_js_1.requireString)(data, 'authorId', 'authorId'));
    if (errors.length)
        return (0, httpUtil_js_1.failErrors)(errors);
    return (0, httpUtil_js_1.okData)(data);
}
function buildDocCreate(data) {
    return {
        projectId: String(data.projectId).trim(),
        title: String(data.title).trim(),
        type: data.type,
        content: String(data.content),
        authorId: String(data.authorId).trim(),
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    };
}
function validateRecurringTemplateCreate(data, actor) {
    if (!actor?.userId)
        return (0, httpUtil_js_1.failErrors)(['actor.userId — חובה']);
    const errors = (0, httpUtil_js_1.mergeErrors)((0, httpUtil_js_1.requireString)(data, 'title', 'title'), (0, httpUtil_js_1.requireString)(data, 'assigneeId', 'assigneeId'), (0, httpUtil_js_1.requireEnum)(data, 'frequency', TASK_RECURRENCE, 'frequency'));
    if (errors.length)
        return (0, httpUtil_js_1.failErrors)(errors);
    if (data.frequency === 'weekly' && typeof data.weeklyDayOfWeek !== 'number') {
        return (0, httpUtil_js_1.failErrors)(['weeklyDayOfWeek — חובה 0–6 כש-frequency הוא weekly']);
    }
    return (0, httpUtil_js_1.okData)(data);
}
function buildRecurringTemplateCreate(data, actor) {
    return (0, httpUtil_js_1.stripUndefined)({
        title: String(data.title).trim(),
        description: (0, httpUtil_js_1.optionalString)(data, 'description') ?? '',
        assigneeId: String(data.assigneeId).trim(),
        frequency: data.frequency,
        weeklyDayOfWeek: data.frequency === 'weekly' ? data.weeklyDayOfWeek : undefined,
        priority: (0, httpUtil_js_1.optionalString)(data, 'priority') ?? 'medium',
        clientId: (0, httpUtil_js_1.optionalString)(data, 'clientId'),
        projectId: (0, httpUtil_js_1.optionalString)(data, 'projectId'),
        supplierId: (0, httpUtil_js_1.optionalString)(data, 'supplierId'),
        tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
        active: data.active !== false,
        createdBy: actor.userId,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
}
function validateAgentCommissionCreate(data, actor) {
    if (!actor?.userId)
        return (0, httpUtil_js_1.failErrors)(['actor.userId — חובה']);
    const errors = (0, httpUtil_js_1.mergeErrors)((0, httpUtil_js_1.requireString)(data, 'agentUserId', 'agentUserId'), (0, httpUtil_js_1.requireNumber)(data, 'amount', 'amount', 0), (0, httpUtil_js_1.requireYmd)(data, 'paidDate', 'paidDate'));
    if (errors.length)
        return (0, httpUtil_js_1.failErrors)(errors);
    return (0, httpUtil_js_1.okData)(data);
}
function buildAgentCommissionCreate(data, actor) {
    return (0, httpUtil_js_1.stripUndefined)({
        agentUserId: String(data.agentUserId).trim(),
        amount: Number(data.amount),
        paidDate: String(data.paidDate).slice(0, 10),
        note: (0, httpUtil_js_1.optionalString)(data, 'note'),
        clientId: (0, httpUtil_js_1.optionalString)(data, 'clientId'),
        dealId: (0, httpUtil_js_1.optionalString)(data, 'dealId'),
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        createdBy: actor.userId,
    });
}
const CREATE_HANDLERS = {
    tasks: async (data, actor) => {
        const v = validateTaskCreate(data, actor);
        if (!v.ok)
            throw new ValidationHttpError(v.errors);
        const uname = await resolveActorName(actor);
        const doc = buildTaskCreate(v.data, actor, uname);
        const ref = await db.collection('tasks').add(doc);
        await db.collection('tasks').doc(ref.id).collection('activity').add({
            userId: actor.userId,
            userName: uname,
            action: `${uname} יצר את המשימה`,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
        return { doc, collectionPath: 'tasks', docId: ref.id };
    },
    projects: async (data) => {
        const v = validateProjectCreate(data);
        if (!v.ok)
            throw new ValidationHttpError(v.errors);
        const doc = buildProjectCreate(v.data);
        const ref = await db.collection('projects').add(doc);
        return { doc, collectionPath: 'projects', docId: ref.id };
    },
    leads: async (data, actor) => {
        const v = validateLeadCreate(data, actor);
        if (!v.ok)
            throw new ValidationHttpError(v.errors);
        const uname = await resolveActorName(actor);
        const doc = buildLeadCreate(v.data, actor, uname);
        const ref = await db.collection('leads').add(doc);
        return { doc, collectionPath: 'leads', docId: ref.id };
    },
    clients: async (data, actor) => {
        const v = validateClientCreate(data, actor);
        if (!v.ok)
            throw new ValidationHttpError(v.errors);
        const uname = await resolveActorName(actor);
        const doc = buildClientCreate(v.data, actor, uname);
        const ref = await db.collection('clients').add(doc);
        return { doc, collectionPath: 'clients', docId: ref.id };
    },
    suppliers: async (data, actor) => {
        const v = validateSupplierCreate(data, actor);
        if (!v.ok)
            throw new ValidationHttpError(v.errors);
        const uname = await resolveActorName(actor);
        const doc = buildSupplierCreate(v.data, actor, uname);
        const ref = await db.collection('suppliers').add(doc);
        return { doc, collectionPath: 'suppliers', docId: ref.id };
    },
    campaigns: async (data, actor) => {
        const v = validateCampaignCreate(data, actor);
        if (!v.ok)
            throw new ValidationHttpError(v.errors);
        const uname = await resolveActorName(actor);
        const doc = buildCampaignCreate(v.data, actor, uname);
        const ref = await db.collection('campaigns').add(doc);
        return { doc, collectionPath: 'campaigns', docId: ref.id };
    },
    meetings: async (data, actor) => {
        const v = validateMeetingCreate(data, actor);
        if (!v.ok)
            throw new ValidationHttpError(v.errors);
        const doc = buildMeetingCreate(v.data, actor);
        const ref = await db.collection('meetings').add(doc);
        return { doc, collectionPath: 'meetings', docId: ref.id };
    },
    invoices: async (data) => {
        const v = validateInvoiceCreate(data);
        if (!v.ok)
            throw new ValidationHttpError(v.errors);
        const doc = buildInvoiceCreate(v.data);
        const ref = await db.collection('invoices').add(doc);
        return { doc, collectionPath: 'invoices', docId: ref.id };
    },
    deals: async (data, actor) => {
        const v = validateDealCreate(data, actor);
        if (!v.ok)
            throw new ValidationHttpError(v.errors);
        const doc = buildDealCreate(v.data, actor);
        const ref = await db.collection('deals').add(doc);
        return { doc, collectionPath: 'deals', docId: ref.id };
    },
    collectiontracking: async (data, actor) => {
        const v = validateCollectionTrackingUpsert(data);
        if (!v.ok)
            throw new ValidationHttpError(v.errors);
        const clientId = String(data.clientId).trim();
        const uname = actor ? await resolveActorName(actor) : 'Dify';
        const ref = db.collection('collectionTracking').doc(clientId);
        const snap = await ref.get();
        const patch = {
            clientId,
            lastRequestDate: String(data.lastRequestDate).slice(0, 10),
            dueDate: String(data.dueDate).slice(0, 10),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
            ...((0, httpUtil_js_1.optionalString)(data, 'paidDate')
                ? { paidDate: (0, httpUtil_js_1.optionalString)(data, 'paidDate') }
                : { paidDate: firestore_1.FieldValue.delete() }),
            ...((0, httpUtil_js_1.optionalString)(data, 'note')
                ? { note: (0, httpUtil_js_1.optionalString)(data, 'note') }
                : { note: firestore_1.FieldValue.delete() }),
            ...(snap.exists ? {} : { createdAt: firestore_1.FieldValue.serverTimestamp() }),
            ...(actor
                ? {
                    lastActorUserId: actor.userId,
                    lastActorUserName: uname,
                }
                : {}),
        };
        await ref.set(patch, { merge: true });
        return { doc: patch, collectionPath: 'collectionTracking', docId: clientId };
    },
    hostingrecords: async (data) => {
        const v = validateHostingCreate(data);
        if (!v.ok)
            throw new ValidationHttpError(v.errors);
        const doc = { ...buildHostingDoc(v.data), createdAt: firestore_1.FieldValue.serverTimestamp() };
        const ref = await db.collection('hostingRecords').add(doc);
        return { doc, collectionPath: 'hostingRecords', docId: ref.id };
    },
    docs: async (data) => {
        const v = validateDocCreate(data);
        if (!v.ok)
            throw new ValidationHttpError(v.errors);
        const doc = buildDocCreate(v.data);
        const ref = await db.collection('docs').add(doc);
        return { doc, collectionPath: 'docs', docId: ref.id };
    },
    recurringtasktemplates: async (data, actor) => {
        const v = validateRecurringTemplateCreate(data, actor);
        if (!v.ok)
            throw new ValidationHttpError(v.errors);
        const doc = buildRecurringTemplateCreate(v.data, actor);
        const ref = await db.collection('recurringTaskTemplates').add(doc);
        return { doc, collectionPath: 'recurringTaskTemplates', docId: ref.id };
    },
    agentcommissionpayments: async (data, actor) => {
        const v = validateAgentCommissionCreate(data, actor);
        if (!v.ok)
            throw new ValidationHttpError(v.errors);
        const doc = buildAgentCommissionCreate(v.data, actor);
        const ref = await db.collection('agentCommissionPayments').add(doc);
        return { doc, collectionPath: 'agentCommissionPayments', docId: ref.id };
    },
    domainrecords: async (data) => {
        const domain = (0, httpUtil_js_1.requireString)(data, 'domain', 'domain');
        if (domain.errors.length)
            throw new ValidationHttpError(domain.errors);
        const doc = (0, httpUtil_js_1.stripUndefined)({
            domain: domain.value,
            inHostinger: data.inHostinger === true,
            notes: (0, httpUtil_js_1.optionalString)(data, 'notes'),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        const ref = await db.collection('domainRecords').add(doc);
        return { doc, collectionPath: 'domainRecords', docId: ref.id };
    },
};
class ValidationHttpError extends Error {
    errors;
    constructor(errors) {
        super(errors.join('; '));
        this.errors = errors;
    }
}
exports.ValidationHttpError = ValidationHttpError;
function parseLimitFromQuery(reqQuery, max = 200, fallback = 100) {
    const raw = reqQuery.limit;
    const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : Number.NaN;
    if (!Number.isFinite(n) || n < 1)
        return fallback;
    return Math.min(Math.floor(n), max);
}
async function handleGet(entity, id, reqQuery, res) {
    if (typeof reqQuery.meta === 'string' && reqQuery.meta === 'schema') {
        res.status(200).json({ ok: true, catalog: apiCatalog() });
        return;
    }
    const col = COLLECTION_ALIASES[entity];
    const limit = parseLimitFromQuery(reqQuery);
    if (id) {
        const snap = await db.collection(col).doc(id).get();
        if (!snap.exists) {
            res.status(404).json({ ok: false, error: 'not_found', entity, id });
            return;
        }
        res.status(200).json({ ok: true, entity, item: (0, httpUtil_js_1.serializeDoc)(snap.id, snap.data()) });
        return;
    }
    const snap = await db.collection(col).limit(limit).get();
    let items = snap.docs.map((d) => (0, httpUtil_js_1.serializeDoc)(d.id, d.data()));
    const filters = {
        status: typeof reqQuery.status === 'string' ? reqQuery.status : undefined,
        clientId: typeof reqQuery.clientId === 'string' ? reqQuery.clientId : undefined,
        projectId: typeof reqQuery.projectId === 'string' ? reqQuery.projectId : undefined,
        assigneeId: typeof reqQuery.assigneeId === 'string' ? reqQuery.assigneeId : undefined,
        ownerId: typeof reqQuery.ownerId === 'string' ? reqQuery.ownerId : undefined,
        q: typeof reqQuery.q === 'string' ? reqQuery.q : undefined,
    };
    items = applyListFilters(items, filters);
    res.status(200).json({ ok: true, entity, count: items.length, limit, items });
}
async function handlePost(entity, id, body, sub, res) {
    if (READ_ONLY.has(entity)) {
        (0, httpUtil_js_1.badRequest)(res, `entity ${entity} — קריאה בלבד`);
        return;
    }
    if (entity === 'tasks' && sub === 'notes' && id) {
        const actor = (0, httpUtil_js_1.parseActor)(body);
        if (!actor) {
            (0, httpUtil_js_1.badRequest)(res, 'actor.userId — חובה להוספת הערה');
            return;
        }
        const data = (0, httpUtil_js_1.parseDataPayload)(body);
        const text = (0, httpUtil_js_1.requireString)(data, 'text', 'text');
        if (text.errors.length) {
            (0, httpUtil_js_1.badRequest)(res, text.errors);
            return;
        }
        const uname = await resolveActorName(actor);
        const ref = await db.collection('tasks').doc(id).collection('taskNotes').add({
            userId: actor.userId,
            userName: uname,
            text: text.value,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
        res.status(201).json({ ok: true, entity: 'tasks', subResource: 'notes', taskId: id, noteId: ref.id });
        return;
    }
    const handler = CREATE_HANDLERS[entity];
    if (!handler) {
        (0, httpUtil_js_1.badRequest)(res, `POST לא נתמך עבור ${entity}`);
        return;
    }
    const data = (0, httpUtil_js_1.parseDataPayload)(body);
    const actor = (0, httpUtil_js_1.parseActor)(body);
    try {
        const result = await handler(data, actor);
        res.status(201).json({
            ok: true,
            entity,
            id: result.docId,
            collection: result.collectionPath,
        });
    }
    catch (e) {
        if (e instanceof ValidationHttpError) {
            (0, httpUtil_js_1.badRequest)(res, e.errors);
            return;
        }
        throw e;
    }
}
/** PATCH — מיזוג שדות מותרים; לא מקבל undefined */
async function handlePatch(entity, id, body, res) {
    if (!id) {
        (0, httpUtil_js_1.badRequest)(res, 'query id — חובה לעדכון');
        return;
    }
    if (READ_ONLY.has(entity)) {
        (0, httpUtil_js_1.badRequest)(res, `entity ${entity} — קריאה בלבד`);
        return;
    }
    const col = COLLECTION_ALIASES[entity];
    const ref = db.collection(col).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
        res.status(404).json({ ok: false, error: 'not_found', entity, id });
        return;
    }
    const data = (0, httpUtil_js_1.parseDataPayload)(body);
    const actor = (0, httpUtil_js_1.parseActor)(body);
    const patch = {};
    for (const [k, v] of Object.entries(data)) {
        if (v !== undefined && v !== null)
            patch[k] = v;
    }
    if (entity === 'projects' && patch.type !== undefined) {
        patch.projectKind = patch.type;
        delete patch.type;
    }
    if (entity === 'leads' && patch.status === 'not_relevant' && !patch.notRelevantReason) {
        const existing = snap.data()?.notRelevantReason;
        if (!existing) {
            (0, httpUtil_js_1.badRequest)(res, 'notRelevantReason — חובה כש-status הוא not_relevant');
            return;
        }
    }
    if (actor) {
        const uname = await resolveActorName(actor);
        Object.assign(patch, actorFields(actor, uname));
    }
    if (entity === 'deals') {
        patch.updatedAt = firestore_1.FieldValue.serverTimestamp();
    }
    if (Object.keys(patch).length === 0) {
        (0, httpUtil_js_1.badRequest)(res, 'data — אין שדות לעדכון');
        return;
    }
    await ref.update((0, httpUtil_js_1.stripUndefined)(patch));
    const updated = await ref.get();
    res.status(200).json({
        ok: true,
        entity,
        id,
        item: (0, httpUtil_js_1.serializeDoc)(updated.id, updated.data()),
    });
}
async function handleDelete(entity, id, res) {
    if (!id) {
        (0, httpUtil_js_1.badRequest)(res, 'query id — חובה למחיקה');
        return;
    }
    if (entity === 'collectiontracking') {
        (0, httpUtil_js_1.badRequest)(res, 'מחיקה: DELETE עם id=clientId להסרה ממעקב');
        return;
    }
    if (READ_ONLY.has(entity)) {
        (0, httpUtil_js_1.badRequest)(res, `entity ${entity} — קריאה בלבד`);
        return;
    }
    const col = COLLECTION_ALIASES[entity];
    const ref = db.collection(col).doc(id);
    if (entity === 'deals') {
        const inv = await db.collection('invoices').where('dealId', '==', id).get();
        const batch = db.batch();
        for (const d of inv.docs)
            batch.delete(d.ref);
        batch.delete(ref);
        await batch.commit();
    }
    else if (entity === 'projects') {
        const tasks = await db.collection('tasks').where('projectId', '==', id).get();
        const docs = await db.collection('docs').where('projectId', '==', id).get();
        const batch = db.batch();
        for (const t of tasks.docs) {
            batch.delete(t.ref);
            const act = await t.ref.collection('activity').get();
            for (const a of act.docs)
                batch.delete(a.ref);
            const notes = await t.ref.collection('taskNotes').get();
            for (const n of notes.docs)
                batch.delete(n.ref);
        }
        for (const d of docs.docs)
            batch.delete(d.ref);
        batch.delete(ref);
        await batch.commit();
    }
    else if (entity === 'tasks') {
        const act = await ref.collection('activity').get();
        const notes = await ref.collection('taskNotes').get();
        const batch = db.batch();
        for (const a of act.docs)
            batch.delete(a.ref);
        for (const n of notes.docs)
            batch.delete(n.ref);
        batch.delete(ref);
        await batch.commit();
    }
    else {
        await ref.delete();
    }
    res.status(200).json({ ok: true, entity, id, deleted: true });
}
