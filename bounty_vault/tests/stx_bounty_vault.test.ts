import { describe, expect, it, beforeEach } from "vitest";

// Mock Stacks/Clarity contract interaction utilities
class MockStacksContract {
  constructor() {
    this.storage = new Map();
    this.blockHeight = 1000;
    this.contractOwner = "ST1HTBVD3JG9C05J7HBJTHGR0GGW7KXW28M5JS8QE";
    this.currentSender = this.contractOwner;

    // Initialize contract state
    this.storage.set("next-bounty-id", 1);
    this.storage.set("next-submission-id", 1);
    this.storage.set("platform-fee-rate", 250); // 2.5%
    this.storage.set("dispute-period-blocks", 1008); // ~7 days
    this.storage.set("verification-timeout-blocks", 4320); // ~30 days
    this.storage.set("min-bounty-amount", 1000000); // 1 STX
    this.storage.set("platform-treasury", this.contractOwner);

    this.bounties = new Map();
    this.submissions = new Map();
    this.escrowHoldings = new Map();
    this.bountySubmissions = new Map();
    this.developerProfiles = new Map();
    this.disputes = new Map();
    this.verifiers = new Map();
    this.bountyCreatorLookup = new Map();
    this.userBounties = new Map();
    this.developerSubmissions = new Map();
    this.balances = new Map();

    // Initialize balances
    this.balances.set(this.contractOwner, 10000000000); // 10,000 STX
    this.balances.set("contract", 0);
  }

  // Helper methods
  setCurrentSender(sender) {
    this.currentSender = sender;
  }

  advanceBlockHeight(blocks) {
    this.blockHeight += blocks;
  }

  getBalance(address) {
    return this.balances.get(address) || 0;
  }

  transfer(from, to, amount) {
    const fromBalance = this.getBalance(from);
    if (fromBalance < amount) {
      throw new Error("Insufficient funds");
    }
    this.balances.set(from, fromBalance - amount);
    this.balances.set(to, this.getBalance(to) + amount);
  }

  // Contract constants
  get constants() {
    return {
      statusActive: 1,
      statusSubmitted: 2,
      statusVerified: 3,
      statusCompleted: 4,
      statusDisputed: 5,
      statusCancelled: 6,
      priorityLow: 1,
      priorityMedium: 2,
      priorityHigh: 3,
      priorityCritical: 4,
      difficultyBeginner: 1,
      difficultyIntermediate: 2,
      difficultyAdvanced: 3,
      difficultyExpert: 4,
    };
  }

  // Contract functions
  createBounty(
    title,
    description,
    requirements,
    repositoryUrl,
    amount,
    deadlineBlocks,
    priority,
    difficulty,
    tags,
    verifier
  ) {
    // Input validation
    if (amount < this.storage.get("min-bounty-amount")) {
      throw new Error("Insufficient funds");
    }
    if (deadlineBlocks <= 0) {
      throw new Error("Invalid input");
    }
    if (priority < 1 || priority > 4) {
      throw new Error("Invalid input");
    }
    if (difficulty < 1 || difficulty > 4) {
      throw new Error("Invalid input");
    }
    if (!title || title.length === 0) {
      throw new Error("Invalid input");
    }

    // Check verifier if provided
    if (verifier && !this.verifiers.has(verifier)) {
      throw new Error("Verifier not found");
    }

    const bountyId = this.storage.get("next-bounty-id");
    const deadline = this.blockHeight + deadlineBlocks;

    // Transfer funds to escrow
    this.transfer(this.currentSender, "contract", amount);

    // Create bounty
    const bounty = {
      id: bountyId,
      creator: this.currentSender,
      title,
      description,
      requirements,
      repositoryUrl,
      amount,
      deadline,
      priority,
      difficulty,
      tags,
      status: this.constants.statusActive,
      createdAt: this.blockHeight,
      verificationDeadline: null,
      assignedTo: null,
      verifier,
    };

    this.bounties.set(bountyId, bounty);
    this.escrowHoldings.set(bountyId, {
      amount,
      locked: true,
      released: false,
    });
    this.bountyCreatorLookup.set(bountyId, this.currentSender);
    this.userBounties.set(`${this.currentSender}-${bountyId}`, true);

    this.storage.set("next-bounty-id", bountyId + 1);

    return bountyId;
  }

  updateBountyDetails(
    bountyId,
    title,
    description,
    requirements,
    repositoryUrl
  ) {
    const bounty = this.bounties.get(bountyId);
    if (!bounty) {
      throw new Error("Bounty not found");
    }
    if (bounty.creator !== this.currentSender) {
      throw new Error("Unauthorized");
    }
    if (bounty.status !== this.constants.statusActive) {
      throw new Error("Bounty not active");
    }

    const updatedBounty = {
      ...bounty,
      title,
      description,
      requirements,
      repositoryUrl,
    };

    this.bounties.set(bountyId, updatedBounty);
    return true;
  }

  assignBounty(bountyId, developer) {
    const bounty = this.bounties.get(bountyId);
    if (!bounty) {
      throw new Error("Bounty not found");
    }
    if (bounty.creator !== this.currentSender) {
      throw new Error("Unauthorized");
    }
    if (bounty.status !== this.constants.statusActive) {
      throw new Error("Bounty not active");
    }

    bounty.assignedTo = developer;
    this.bounties.set(bountyId, bounty);
    return true;
  }

  cancelBounty(bountyId) {
    const bounty = this.bounties.get(bountyId);
    const escrow = this.escrowHoldings.get(bountyId);

    if (!bounty || !escrow) {
      throw new Error("Bounty not found");
    }
    if (bounty.creator !== this.currentSender) {
      throw new Error("Unauthorized");
    }
    if (bounty.status !== this.constants.statusActive) {
      throw new Error("Bounty not active");
    }

    // Return funds to creator
    this.transfer("contract", bounty.creator, escrow.amount);

    // Update status
    bounty.status = this.constants.statusCancelled;
    escrow.locked = false;
    escrow.released = true;

    this.bounties.set(bountyId, bounty);
    this.escrowHoldings.set(bountyId, escrow);

    return true;
  }

  submitWork(bountyId, submissionUrl, description) {
    const bounty = this.bounties.get(bountyId);
    if (!bounty) {
      throw new Error("Bounty not found");
    }
    if (bounty.status !== this.constants.statusActive) {
      throw new Error("Bounty not active");
    }
    if (this.blockHeight >= bounty.deadline) {
      throw new Error("Bounty expired");
    }
    if (this.bountySubmissions.has(`${bountyId}-${this.currentSender}`)) {
      throw new Error("Already submitted");
    }
    if (!submissionUrl || submissionUrl.length === 0) {
      throw new Error("Invalid input");
    }

    // Check assignment
    if (bounty.assignedTo && bounty.assignedTo !== this.currentSender) {
      throw new Error("Unauthorized");
    }

    const submissionId = this.storage.get("next-submission-id");
    const verificationDeadline =
      this.blockHeight + this.storage.get("verification-timeout-blocks");

    const submission = {
      id: submissionId,
      bountyId,
      developer: this.currentSender,
      submissionUrl,
      description,
      submittedAt: this.blockHeight,
      verified: false,
      verificationNotes: null,
      verifiedAt: null,
      verifiedBy: null,
    };

    this.submissions.set(submissionId, submission);
    this.bountySubmissions.set(
      `${bountyId}-${this.currentSender}`,
      submissionId
    );
    this.developerSubmissions.set(`${this.currentSender}-${bountyId}`, true);

    // Update bounty
    bounty.status = this.constants.statusSubmitted;
    bounty.verificationDeadline = verificationDeadline;
    this.bounties.set(bountyId, bounty);

    this.storage.set("next-submission-id", submissionId + 1);

    return submissionId;
  }

  verifySubmission(bountyId, developer, approved, notes) {
    const bounty = this.bounties.get(bountyId);
    if (!bounty) {
      throw new Error("Bounty not found");
    }

    const submissionId = this.bountySubmissions.get(`${bountyId}-${developer}`);
    if (!submissionId) {
      throw new Error("Submission not found");
    }

    const submission = this.submissions.get(submissionId);
    if (!submission) {
      throw new Error("Submission not found");
    }

    // Check authorization (bounty creator or assigned verifier)
    const isAuthorized =
      bounty.creator === this.currentSender ||
      (bounty.verifier && bounty.verifier === this.currentSender);
    if (!isAuthorized) {
      throw new Error("Unauthorized");
    }

    if (bounty.status !== this.constants.statusSubmitted) {
      throw new Error("Invalid status");
    }
    if (submission.verified) {
      throw new Error("Already verified");
    }

    // Update submission
    submission.verified = approved;
    submission.verificationNotes = notes;
    submission.verifiedAt = this.blockHeight;
    submission.verifiedBy = this.currentSender;
    this.submissions.set(submissionId, submission);

    // Update bounty status
    bounty.status = approved
      ? this.constants.statusVerified
      : this.constants.statusActive;
    this.bounties.set(bountyId, bounty);

    return approved;
  }

  releasePayment(bountyId, developer) {
    const bounty = this.bounties.get(bountyId);
    const escrow = this.escrowHoldings.get(bountyId);

    if (!bounty || !escrow) {
      throw new Error("Bounty not found");
    }
    if (bounty.status !== this.constants.statusVerified) {
      throw new Error("Invalid status");
    }
    if (escrow.released) {
      throw new Error("Already released");
    }

    const submissionId = this.bountySubmissions.get(`${bountyId}-${developer}`);
    const submission = this.submissions.get(submissionId);

    if (!submission || !submission.verified) {
      throw new Error("Submission not verified");
    }

    // Check dispute period
    const disputePeriod = this.storage.get("dispute-period-blocks");
    if (
      submission.verifiedAt &&
      this.blockHeight <= submission.verifiedAt + disputePeriod
    ) {
      throw new Error("Dispute period active");
    }

    const bountyAmount = escrow.amount;
    const platformFeeRate = this.storage.get("platform-fee-rate");
    const platformFee = Math.floor((bountyAmount * platformFeeRate) / 10000);
    const developerPayment = bountyAmount - platformFee;

    // Transfer payments
    this.transfer("contract", developer, developerPayment);
    this.transfer(
      "contract",
      this.storage.get("platform-treasury"),
      platformFee
    );

    // Update records
    bounty.status = this.constants.statusCompleted;
    escrow.locked = false;
    escrow.released = true;

    this.bounties.set(bountyId, bounty);
    this.escrowHoldings.set(bountyId, escrow);

    // Update developer profile
    let profile = this.developerProfiles.get(developer) || {
      reputationScore: 0,
      completedBounties: 0,
      totalEarned: 0,
      specialties: [],
      githubUsername: null,
      contactInfo: null,
      joinedAt: this.blockHeight,
      isVerified: false,
    };

    profile.completedBounties++;
    profile.totalEarned += developerPayment;
    profile.reputationScore += 10;

    this.developerProfiles.set(developer, profile);

    return developerPayment;
  }

  createDispute(bountyId, reason) {
    const bounty = this.bounties.get(bountyId);
    if (!bounty) {
      throw new Error("Bounty not found");
    }

    const isAuthorized =
      bounty.creator === this.currentSender ||
      bounty.assignedTo === this.currentSender;
    if (!isAuthorized) {
      throw new Error("Unauthorized");
    }
    if (bounty.status !== this.constants.statusVerified) {
      throw new Error("Invalid status");
    }

    const dispute = {
      bountyId,
      disputedBy: this.currentSender,
      reason,
      createdAt: this.blockHeight,
      resolved: false,
      resolution: null,
      resolvedBy: null,
      resolvedAt: null,
    };

    this.disputes.set(bountyId, dispute);
    bounty.status = this.constants.statusDisputed;
    this.bounties.set(bountyId, bounty);

    return true;
  }

  addVerifier(verifierPrincipal, domains) {
    if (this.currentSender !== this.contractOwner) {
      throw new Error("Owner only");
    }
    if (this.verifiers.has(verifierPrincipal)) {
      throw new Error("Already verified");
    }

    const verifier = {
      domains,
      reputation: 0,
      verifiedCount: 0,
      addedBy: this.currentSender,
      addedAt: this.blockHeight,
      isActive: true,
    };

    this.verifiers.set(verifierPrincipal, verifier);
    return true;
  }

  createDeveloperProfile(specialties, githubUsername, contactInfo) {
    if (this.developerProfiles.has(this.currentSender)) {
      throw new Error("Already exists");
    }

    const profile = {
      reputationScore: 0,
      completedBounties: 0,
      totalEarned: 0,
      specialties,
      githubUsername,
      contactInfo,
      joinedAt: this.blockHeight,
      isVerified: false,
    };

    this.developerProfiles.set(this.currentSender, profile);
    return true;
  }

  // Read-only functions
  getBounty(bountyId) {
    return this.bounties.get(bountyId) || null;
  }

  getSubmission(submissionId) {
    return this.submissions.get(submissionId) || null;
  }

  getBountySubmission(bountyId, developer) {
    const submissionId = this.bountySubmissions.get(`${bountyId}-${developer}`);
    return submissionId ? this.submissions.get(submissionId) : null;
  }

  getEscrowInfo(bountyId) {
    return this.escrowHoldings.get(bountyId) || null;
  }

  getDeveloperProfile(developer) {
    return this.developerProfiles.get(developer) || null;
  }

  isBountyActive(bountyId) {
    const bounty = this.bounties.get(bountyId);
    return (
      bounty &&
      bounty.status === this.constants.statusActive &&
      this.blockHeight < bounty.deadline
    );
  }

  canSubmitWork(bountyId, developer) {
    const bounty = this.bounties.get(bountyId);
    if (!bounty) return false;

    const hasSubmitted = this.bountySubmissions.has(`${bountyId}-${developer}`);
    const isAssignedOrUnassigned =
      !bounty.assignedTo || bounty.assignedTo === developer;

    return (
      bounty.status === this.constants.statusActive &&
      this.blockHeight < bounty.deadline &&
      !hasSubmitted &&
      isAssignedOrUnassigned
    );
  }

  getContractStats() {
    return {
      totalBounties: this.storage.get("next-bounty-id") - 1,
      totalSubmissions: this.storage.get("next-submission-id") - 1,
      platformFeeRate: this.storage.get("platform-fee-rate"),
      disputePeriodBlocks: this.storage.get("dispute-period-blocks"),
      verificationTimeoutBlocks: this.storage.get(
        "verification-timeout-blocks"
      ),
      minBountyAmount: this.storage.get("min-bounty-amount"),
    };
  }
}

describe("Code Bounty Escrow Contract", () => {
  let contract;
  let creator;
  let developer1;
  let developer2;
  let verifier;

  beforeEach(() => {
    contract = new MockStacksContract();
    creator = "ST1HTBVD3JG9C05J7HBJTHGR0GGW7KXW28M5JS8QE";
    developer1 = "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG";
    developer2 = "ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC";
    verifier = "ST2REHHS5J3CERCRBEPMGH7921Q6PYKAADT7JP2VB";

    // Initialize balances for test users
    contract.balances.set(creator, 10000000000);
    contract.balances.set(developer1, 5000000000);
    contract.balances.set(developer2, 5000000000);
    contract.balances.set(verifier, 5000000000);
  });

  describe("Bounty Creation", () => {
    it("should create a bounty successfully", () => {
      contract.setCurrentSender(creator);

      const bountyId = contract.createBounty(
        "Fix authentication bug",
        "Need to fix login issues in the app",
        "Must include unit tests and documentation",
        "https://github.com/example/repo",
        5000000, // 5 STX
        1440, // 10 days
        contract.constants.priorityHigh,
        contract.constants.difficultyIntermediate,
        ["javascript", "nodejs", "authentication"],
        null
      );

      expect(bountyId).toBe(1);

      const bounty = contract.getBounty(bountyId);
      expect(bounty).toBeTruthy();
      expect(bounty.creator).toBe(creator);
      expect(bounty.title).toBe("Fix authentication bug");
      expect(bounty.amount).toBe(5000000);
      expect(bounty.status).toBe(contract.constants.statusActive);

      const escrow = contract.getEscrowInfo(bountyId);
      expect(escrow.amount).toBe(5000000);
      expect(escrow.locked).toBe(true);
      expect(escrow.released).toBe(false);

      expect(contract.getBalance(creator)).toBe(10000000000 - 5000000);
      expect(contract.getBalance("contract")).toBe(5000000);
    });

    it("should reject bounty with insufficient amount", () => {
      contract.setCurrentSender(creator);

      expect(() => {
        contract.createBounty(
          "Small task",
          "Description",
          "Requirements",
          null,
          500000, // Less than minimum
          1440,
          contract.constants.priorityLow,
          contract.constants.difficultyBeginner,
          [],
          null
        );
      }).toThrow("Insufficient funds");
    });

    it("should reject bounty with invalid parameters", () => {
      contract.setCurrentSender(creator);

      expect(() => {
        contract.createBounty(
          "",
          "Description",
          "Requirements",
          null,
          5000000,
          1440,
          contract.constants.priorityHigh,
          contract.constants.difficultyIntermediate,
          [],
          null
        );
      }).toThrow("Invalid input");
    });

    it("should create bounty with verifier", () => {
      contract.setCurrentSender(creator);
      contract.addVerifier(verifier, ["javascript", "security"]);

      const bountyId = contract.createBounty(
        "Security audit",
        "Need security review",
        "Must check for vulnerabilities",
        null,
        10000000,
        2880,
        contract.constants.priorityCritical,
        contract.constants.difficultyExpert,
        ["security", "audit"],
        verifier
      );

      const bounty = contract.getBounty(bountyId);
      expect(bounty.verifier).toBe(verifier);
    });
  });

  describe("Bounty Management", () => {
    let bountyId;

    beforeEach(() => {
      contract.setCurrentSender(creator);
      bountyId = contract.createBounty(
        "Test bounty",
        "Description",
        "Requirements",
        null,
        5000000,
        1440,
        contract.constants.priorityMedium,
        contract.constants.difficultyIntermediate,
        ["test"],
        null
      );
    });

    it("should update bounty details", () => {
      const result = contract.updateBountyDetails(
        bountyId,
        "Updated title",
        "Updated description",
        "Updated requirements",
        "https://new-repo.com"
      );

      expect(result).toBe(true);

      const bounty = contract.getBounty(bountyId);
      expect(bounty.title).toBe("Updated title");
      expect(bounty.description).toBe("Updated description");
      expect(bounty.repositoryUrl).toBe("https://new-repo.com");
    });

    it("should assign bounty to developer", () => {
      const result = contract.assignBounty(bountyId, developer1);

      expect(result).toBe(true);

      const bounty = contract.getBounty(bountyId);
      expect(bounty.assignedTo).toBe(developer1);
    });

    it("should cancel bounty and refund", () => {
      const initialBalance = contract.getBalance(creator);

      const result = contract.cancelBounty(bountyId);

      expect(result).toBe(true);

      const bounty = contract.getBounty(bountyId);
      expect(bounty.status).toBe(contract.constants.statusCancelled);

      const escrow = contract.getEscrowInfo(bountyId);
      expect(escrow.released).toBe(true);
      expect(escrow.locked).toBe(false);

      expect(contract.getBalance(creator)).toBe(initialBalance + 5000000);
    });

    it("should reject unauthorized operations", () => {
      contract.setCurrentSender(developer1);

      expect(() => {
        contract.updateBountyDetails(bountyId, "Hacked", "Evil", "Bad", null);
      }).toThrow("Unauthorized");

      expect(() => {
        contract.cancelBounty(bountyId);
      }).toThrow("Unauthorized");
    });
  });

  describe("Work Submission", () => {
    let bountyId;

    beforeEach(() => {
      contract.setCurrentSender(creator);
      bountyId = contract.createBounty(
        "Coding task",
        "Build a feature",
        "Must include tests",
        null,
        8000000,
        2880,
        contract.constants.priorityHigh,
        contract.constants.difficultyAdvanced,
        ["javascript", "react"],
        null
      );
    });

    it("should submit work successfully", () => {
      contract.setCurrentSender(developer1);

      const submissionId = contract.submitWork(
        bountyId,
        "https://github.com/dev/solution",
        "Implemented the requested feature with full test coverage"
      );

      expect(submissionId).toBe(1);

      const submission = contract.getSubmission(submissionId);
      expect(submission.developer).toBe(developer1);
      expect(submission.bountyId).toBe(bountyId);
      expect(submission.verified).toBe(false);

      const bounty = contract.getBounty(bountyId);
      expect(bounty.status).toBe(contract.constants.statusSubmitted);
      expect(bounty.verificationDeadline).toBeTruthy();
    });

    it("should prevent duplicate submissions", () => {
      contract.setCurrentSender(developer1);

      contract.submitWork(
        bountyId,
        "https://github.com/dev/solution1",
        "First submission"
      );

      expect(() => {
        contract.submitWork(
          bountyId,
          "https://github.com/dev/solution2",
          "Second submission"
        );
      }).toThrow("Already submitted");
    });

    it("should enforce assignment restrictions", () => {
      contract.setCurrentSender(creator);
      contract.assignBounty(bountyId, developer1);

      contract.setCurrentSender(developer2);

      expect(() => {
        contract.submitWork(
          bountyId,
          "https://github.com/dev2/solution",
          "Unauthorized submission"
        );
      }).toThrow("Unauthorized");
    });

    it("should reject submissions after deadline", () => {
      contract.advanceBlockHeight(3000); // Exceed deadline
      contract.setCurrentSender(developer1);

      expect(() => {
        contract.submitWork(
          bountyId,
          "https://github.com/dev/late",
          "Too late"
        );
      }).toThrow("Bounty expired");
    });
  });

  describe("Verification Process", () => {
    let bountyId;
    let submissionId;

    beforeEach(() => {
      contract.setCurrentSender(creator);
      bountyId = contract.createBounty(
        "Feature request",
        "Add new functionality",
        "Must be well documented",
        null,
        6000000,
        1440,
        contract.constants.priorityMedium,
        contract.constants.difficultyIntermediate,
        ["feature"],
        null
      );

      contract.setCurrentSender(developer1);
      submissionId = contract.submitWork(
        bountyId,
        "https://github.com/dev/feature",
        "Feature implemented as requested"
      );
    });

    it("should verify submission successfully", () => {
      contract.setCurrentSender(creator);

      const result = contract.verifySubmission(
        bountyId,
        developer1,
        true,
        "Great work! All requirements met."
      );

      expect(result).toBe(true);

      const submission = contract.getSubmission(submissionId);
      expect(submission.verified).toBe(true);
      expect(submission.verificationNotes).toBe(
        "Great work! All requirements met."
      );
      expect(submission.verifiedBy).toBe(creator);

      const bounty = contract.getBounty(bountyId);
      expect(bounty.status).toBe(contract.constants.statusVerified);
    });

    it("should reject submission and revert status", () => {
      contract.setCurrentSender(creator);

      const result = contract.verifySubmission(
        bountyId,
        developer1,
        false,
        "Requirements not fully met. Please revise."
      );

      expect(result).toBe(false);

      const submission = contract.getSubmission(submissionId);
      expect(submission.verified).toBe(false);

      const bounty = contract.getBounty(bountyId);
      expect(bounty.status).toBe(contract.constants.statusActive);
    });

    it("should allow verifier to verify", () => {
      contract.setCurrentSender(creator);
      contract.addVerifier(verifier, ["development"]);

      const verifiedBountyId = contract.createBounty(
        "Verified task",
        "Task requiring verification",
        "Must pass verification",
        null,
        7000000,
        1440,
        contract.constants.priorityHigh,
        contract.constants.difficultyAdvanced,
        ["verified"],
        verifier
      );

      contract.setCurrentSender(developer1);
      const verifiedSubmissionId = contract.submitWork(
        verifiedBountyId,
        "https://github.com/dev/verified",
        "Verified solution"
      );

      contract.setCurrentSender(verifier);
      const result = contract.verifySubmission(
        verifiedBountyId,
        developer1,
        true,
        "Verified by trusted verifier"
      );

      expect(result).toBe(true);
    });

    it("should reject unauthorized verification", () => {
      contract.setCurrentSender(developer2);

      expect(() => {
        contract.verifySubmission(
          bountyId,
          developer1,
          true,
          "Unauthorized verification"
        );
      }).toThrow("Unauthorized");
    });
  });

  describe("Payment Release", () => {
    let bountyId;
    let submissionId;

    beforeEach(() => {
      contract.setCurrentSender(creator);
      bountyId = contract.createBounty(
        "Payment test",
        "Testing payment flow",
        "Complete the task",
        null,
        10000000, // 10 STX
        1440,
        contract.constants.priorityMedium,
        contract.constants.difficultyIntermediate,
        ["payment"],
        null
      );

      contract.setCurrentSender(developer1);
      submissionId = contract.submitWork(
        bountyId,
        "https://github.com/dev/payment-test",
        "Task completed"
      );
    });
  });
});
