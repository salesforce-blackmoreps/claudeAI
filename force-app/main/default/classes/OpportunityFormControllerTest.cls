@isTest
private class OpportunityFormControllerTest {

    @TestSetup
    static void setupData() {
        List<Opportunity> opps = new List<Opportunity>{
            new Opportunity(
                Name = 'Opp With Reviewed Form',
                StageName = 'Prospecting',
                CloseDate = Date.today().addDays(30)
            ),
            new Opportunity(
                Name = 'Opp With Only Unreviewed Forms',
                StageName = 'Prospecting',
                CloseDate = Date.today().addDays(30)
            ),
            new Opportunity(
                Name = 'Opp With No Forms',
                StageName = 'Prospecting',
                CloseDate = Date.today().addDays(30)
            )
        };
        insert opps;

        List<Forms__c> forms = new List<Forms__c>{
            new Forms__c(
                Related_Opportunity__c = opps[0].Id,
                Product_Picker_Reviewed__c = true
            ),
            new Forms__c(
                Related_Opportunity__c = opps[0].Id,
                Product_Picker_Reviewed__c = false
            ),
            new Forms__c(
                Related_Opportunity__c = opps[1].Id,
                Product_Picker_Reviewed__c = false
            ),
            new Forms__c(
                Related_Opportunity__c = opps[1].Id,
                Product_Picker_Reviewed__c = false
            )
        };
        insert forms;
    }

    @isTest
    static void returnsTrueWhenReviewedFormExists() {
        Opportunity opp = [
            SELECT Id FROM Opportunity WHERE Name = 'Opp With Reviewed Form' LIMIT 1
        ];

        Test.startTest();
        Boolean result = OpportunityFormController.getFormReviewStatus(opp.Id);
        Test.stopTest();

        System.assertEquals(true, result,
            'Should return true when at least one related form is reviewed.');
    }

    @isTest
    static void returnsFalseWhenNoReviewedForms() {
        Opportunity opp = [
            SELECT Id FROM Opportunity WHERE Name = 'Opp With Only Unreviewed Forms' LIMIT 1
        ];

        Test.startTest();
        Boolean result = OpportunityFormController.getFormReviewStatus(opp.Id);
        Test.stopTest();

        System.assertEquals(false, result,
            'Should return false when no related forms are reviewed.');
    }

    @isTest
    static void returnsFalseWhenOppHasNoForms() {
        Opportunity opp = [
            SELECT Id FROM Opportunity WHERE Name = 'Opp With No Forms' LIMIT 1
        ];

        Test.startTest();
        Boolean result = OpportunityFormController.getFormReviewStatus(opp.Id);
        Test.stopTest();

        System.assertEquals(false, result,
            'Should return false when the opportunity has no related forms at all.');
    }

    @isTest
    static void returnsFalseForNullOppId() {
        Test.startTest();
        Boolean result = OpportunityFormController.getFormReviewStatus(null);
        Test.stopTest();

        System.assertEquals(false, result,
            'Should return false when the opportunity Id is null.');
    }
}
