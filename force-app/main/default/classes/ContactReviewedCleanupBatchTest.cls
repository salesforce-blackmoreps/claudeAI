@isTest
private class ContactReviewedCleanupBatchTest {

    @TestSetup
    static void setupData() {
        List<Contact> contacts = new List<Contact>();
        for (Integer i = 0; i < 5; i++) {
            contacts.add(new Contact(
                LastName = 'Reviewed ' + i,
                Is_Reviewed__c = true
            ));
        }
        for (Integer i = 0; i < 3; i++) {
            contacts.add(new Contact(
                LastName = 'NotReviewed ' + i,
                Is_Reviewed__c = false
            ));
        }
        insert contacts;
    }

    @isTest
    static void batchDeletesOnlyReviewedContacts() {
        Test.startTest();
        Database.executeBatch(new ContactReviewedCleanupBatch(), 200);
        Test.stopTest();

        List<Contact> remainingReviewed = [
            SELECT Id FROM Contact WHERE Is_Reviewed__c = TRUE
        ];
        List<Contact> remainingNotReviewed = [
            SELECT Id FROM Contact WHERE Is_Reviewed__c = FALSE
        ];

        System.assertEquals(0, remainingReviewed.size(),
            'All reviewed contacts should have been deleted.');
        System.assertEquals(3, remainingNotReviewed.size(),
            'Non-reviewed contacts should remain untouched.');
    }

    @isTest
    static void executeHandlesEmptyScope() {
        ContactReviewedCleanupBatch batch = new ContactReviewedCleanupBatch();

        Test.startTest();
        batch.execute(null, new List<Contact>());
        batch.finish(null);
        Test.stopTest();

        List<Contact> reviewed = [
            SELECT Id FROM Contact WHERE Is_Reviewed__c = TRUE
        ];
        System.assertEquals(5, reviewed.size(),
            'Empty scope should not delete anything.');
    }

    @isTest
    static void scheduleEnqueuesBatch() {
        String cron = '0 0 2 * * ?'; // every night at 2 AM

        Test.startTest();
        String jobId = System.schedule(
            'ContactReviewedCleanupBatch_Test',
            cron,
            new ContactReviewedCleanupBatch()
        );
        Test.stopTest();

        CronTrigger ct = [
            SELECT Id, CronExpression, State
            FROM CronTrigger
            WHERE Id = :jobId
        ];
        System.assertEquals(cron, ct.CronExpression,
            'Cron expression should match the scheduled value.');
    }
}
