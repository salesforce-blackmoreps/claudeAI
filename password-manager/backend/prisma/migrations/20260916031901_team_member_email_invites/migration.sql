-- AlterTable
ALTER TABLE "TeamMember" ADD COLUMN     "inviteEmail" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_teamId_inviteEmail_key" ON "TeamMember"("teamId", "inviteEmail");

