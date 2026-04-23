export class PaidFeatureRequiredError extends Error {
	public readonly statusCode = 402;

	constructor(message = "A paid plan is required to use Hermes tools.") {
		super(message);
		this.name = "PaidFeatureRequiredError";
	}
}
