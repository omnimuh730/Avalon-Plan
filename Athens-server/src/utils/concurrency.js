/**
 * In-process async concurrency limiters with FIFO queuing (no 429 rejections).
 * Env knobs are read at factory-call time so tests can override process.env first.
 */

export const DEFAULT_RESUME_GEN_GLOBAL_CONCURRENCY = 4;
export const DEFAULT_RESUME_GEN_PER_USER_CONCURRENCY = 2;
/** High default for bulk identity refresh — press CPU for speed. Override via PDF_RENDER_CONCURRENCY. */
export const DEFAULT_PDF_RENDER_CONCURRENCY = 12;

function envInt(name, fallback) {
	const n = Number.parseInt(String(process.env[name] ?? ''), 10);
	return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getResumeGenGlobalConcurrency() {
	return envInt('RESUME_GEN_GLOBAL_CONCURRENCY', DEFAULT_RESUME_GEN_GLOBAL_CONCURRENCY);
}

export function getResumeGenPerUserConcurrency() {
	return envInt('RESUME_GEN_PER_USER_CONCURRENCY', DEFAULT_RESUME_GEN_PER_USER_CONCURRENCY);
}

export function getPdfRenderConcurrency() {
	return envInt('PDF_RENDER_CONCURRENCY', DEFAULT_PDF_RENDER_CONCURRENCY);
}

/**
 * Simple async semaphore. Waiters are granted slots in FIFO order.
 */
export function createLimiter({ concurrency }) {
	const max = Math.max(1, concurrency);
	let active = 0;
	const waiters = [];

	function tryDrain() {
		while (active < max && waiters.length > 0) {
			active++;
			const { resolve } = waiters.shift();
			resolve();
		}
	}

	function acquire() {
		return new Promise((resolve) => {
			if (active < max) {
				active++;
				resolve();
			} else {
				waiters.push({ resolve });
			}
		});
	}

	function release() {
		if (active <= 0) return;
		active--;
		tryDrain();
	}

	async function run(fn) {
		await acquire();
		try {
			return await fn();
		} finally {
			release();
		}
	}

	return {
		acquire,
		release,
		run,
		get active() {
			return active;
		},
		get pending() {
			return waiters.length;
		},
	};
}

/**
 * Fair limiter: a waiter needs both a global slot and a per-key slot.
 * The FIFO queue never skips ahead — head blocks until it can take both.
 */
export function createFairLimiter({ globalConcurrency, perKeyConcurrency }) {
	const globalMax = Math.max(1, globalConcurrency);
	const perKeyMax = Math.max(1, perKeyConcurrency);
	let globalActive = 0;
	const perKeyActive = new Map();
	const waiters = [];

	function keyCount(key) {
		return perKeyActive.get(key) ?? 0;
	}

	function canGrant(key) {
		return globalActive < globalMax && keyCount(key) < perKeyMax;
	}

	function grant(key) {
		globalActive++;
		perKeyActive.set(key, keyCount(key) + 1);
	}

	function revoke(key) {
		globalActive = Math.max(0, globalActive - 1);
		const next = keyCount(key) - 1;
		if (next <= 0) {
			perKeyActive.delete(key);
		} else {
			perKeyActive.set(key, next);
		}
	}

	function makeRelease(key) {
		let released = false;
		return function releaseSlot() {
			if (released) return;
			released = true;
			revoke(key);
			tryDrain();
		};
	}

	function tryDrain() {
		while (waiters.length > 0) {
			const head = waiters[0];
			if (!canGrant(head.key)) break;
			waiters.shift();
			grant(head.key);
			head.resolve(makeRelease(head.key));
		}
	}

	function acquire(key) {
		const normalizedKey = String(key ?? '');
		return new Promise((resolve) => {
			// Strict FIFO: never skip ahead of an existing waiter, even if a slot is free.
			if (waiters.length === 0 && canGrant(normalizedKey)) {
				grant(normalizedKey);
				resolve(makeRelease(normalizedKey));
			} else {
				waiters.push({ key: normalizedKey, resolve });
				tryDrain();
			}
		});
	}

	/**
	 * @param {string} key
	 * @param {() => Promise<unknown>} fn
	 * @param {{ onQueued?: () => void | Promise<void> }} [opts]
	 */
	async function run(key, fn, opts = {}) {
		const normalizedKey = String(key ?? '');
		const needsWait = waiters.length > 0 || !canGrant(normalizedKey);
		if (needsWait && opts.onQueued) await opts.onQueued();
		const releaseSlot = await acquire(normalizedKey);
		try {
			return await fn();
		} finally {
			releaseSlot();
		}
	}

	return {
		acquire,
		run,
		get globalActive() {
			return globalActive;
		},
		get pending() {
			return waiters.length;
		},
		keyActive(key) {
			return keyCount(String(key ?? ''));
		},
	};
}

export function createResumeGenFairLimiter() {
	return createFairLimiter({
		globalConcurrency: getResumeGenGlobalConcurrency(),
		perKeyConcurrency: getResumeGenPerUserConcurrency(),
	});
}

export function createPdfRenderLimiter() {
	return createLimiter({
		concurrency: getPdfRenderConcurrency(),
	});
}

/** Shared process-wide limiters used by resume gen + PDF render paths. */
export const resumeGenLimiter = createResumeGenFairLimiter();
export const pdfRenderLimiter = createPdfRenderLimiter();
