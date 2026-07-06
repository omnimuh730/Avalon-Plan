import {
	validateScrapedJobInput,
	ingestScrapedJob,
	ingestScrapedJobs,
} from "../services/scrapedJobIngestService.js";

/** POST /api/expose/jobs — ingest one scraped job from a 3rd-party integrator. */
export async function postExternalScrapedJob(req, res) {
	try {
		const body = req.body || {};
		const jobsPayload = Array.isArray(body.jobs) ? body.jobs : null;

		if (jobsPayload) {
			if (jobsPayload.length === 0) {
				return res.status(400).json({ success: false, error: "jobs array cannot be empty" });
			}

			const validated = [];
			for (let i = 0; i < jobsPayload.length; i += 1) {
				const result = validateScrapedJobInput(jobsPayload[i]);
				if (!result.ok) {
					return res.status(400).json({
						success: false,
						error: `jobs[${i}]: ${result.error}`,
					});
				}
				validated.push(result.job);
			}

			const results = await ingestScrapedJobs(validated);
			const created = results.filter((r) => r.created).length;
			const duplicates = results.filter((r) => r.duplicate).length;
			return res.status(201).json({
				success: true,
				created,
				duplicates,
				results,
			});
		}

		const validation = validateScrapedJobInput(body);
		if (!validation.ok) {
			return res.status(400).json({ success: false, error: validation.error });
		}

		const result = await ingestScrapedJob(validation.job);
		if (result.duplicate) {
			return res.status(200).json({
				success: true,
				created: false,
				duplicate: true,
				jobLink: result.jobLink,
			});
		}

		return res.status(201).json({
			success: true,
			created: true,
			id: result.id,
			jobLink: result.jobLink,
		});
	} catch (err) {
		console.error("POST /api/expose/jobs error:", err);
		return res.status(500).json({ success: false, error: err.message });
	}
}
