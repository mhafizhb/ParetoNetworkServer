<template>
    <b-modal
            ref="modalReward"
            centered
            hide-header
            hide-footer
            @hide="onClosedModal"
            :body-bg-variant="'dark'"
            :body-text-variant="'light'">
        <b-container fluid>
            <h4 class="font-body mb-3"> Reward</h4>
            <div v-if="this.signType==='LedgerNano'" class="text-left">
                <p> Before use Ledger Nano S, verify the next items: </p>
                <div class="m-2 ml-4">
                    <ul>
                        <li> The Browser must be Google Chrome or Brave</li>
                        <li> Plugged-in their Ledger Wallet Nano S</li>
                        <li> Input digits pin</li>
                        <li> Navigated to the Ethereum app on their device</li>
                        <li> Enabled 'browser' support from the Ethereum app settings</li>
                    </ul>
                </div>
                <br/>
            </div>
            <p class="text-dashboard mb-2" style="font-size: 16px"> Please enter the number of Pareto Tokens to
                reward</p>
            <b-form-input
                    v-model="tokenAmount"
                    style="font-size: 25px"
                    :formatter="formatAmountNumber"
                    type="number">
            </b-form-input>
            <b-row class="m-2 mt-4 d-flex justify-content-center">
                <button class="btn btn-darker-secondary-pareto" @click="hideModal()"> Cancel</button>
                <button
                    class="btn btn-dark-primary-pareto" :disabled="!hardwareAvailable || parseFloat(tokenAmount) <= 0 || parseFloat(myTokens)< parseFloat(tokenAmount)"
                          @click="rewardIntel(title, rewardId, tokenAmount, intelAddress)"> Confirm
                </button>
            </b-row>
        </b-container>
    </b-modal>
</template>

<script>
    import {mapMutations, mapState, mapActions } from 'vuex';
    import IntelService from "../../services/IntelService";
    import AuthService from "../../services/authService";
    import fromExponential from 'from-exponential';

    export default {
        name: "VModalReward",
        computed: {
            ...mapState(["signType", "pathId" , "showModalReward", "intelReward", "address","myTokens", "userLastApprovedContractAddress"])
        },
        data: function () {
            return{
                title: '',
                rewardId: '',
                intelAddress: '',
                tokenAmount: 1,
                hardwareAvailable: false
            }
        },
        mounted: function(){
            this.$refs.modalReward.show();
            this.rewardId = this.intelReward.id;
            this.title = this.intelReward.title;
            this.intelAddress = this.intelReward.intelAddress;
            this.tokenAmount = Math.min(this.myTokens, this.intelReward.reward);
            this.isAvailable();
        },
        methods: {
            ...mapMutations(["openModalReward"]),
            ...mapActions(["addTransaction", "transactionComplete", "editTransaction"]),
            formatAmountNumber: function (value, event) {
                return fromExponential(value);
            },
            hideModal() {
                if (this.signType === 'LedgerNano') {
                    AuthService.deleteWatchNano();
                    this.hardwareAvailable = false;
                }
                this.openModalReward(false);
            },
            isAvailable() {
                if (this.signType === 'LedgerNano') {
                    this.hardwareAvailable = false;
                    AuthService.doWhenIsConnected(() => {
                        this.hardwareAvailable = true;
                        AuthService.deleteWatchNano();
                    })
                } else {
                    this.hardwareAvailable = true;
                }
            },
            onClosedModal: function () {
                this.openModalReward(false);
            },
            rewardIntel: function (title, ID, tokenAmount, intelAddress) {
                this.hideModal();
                if (!tokenAmount) {
                    this.$notify({
                        group: 'notification',
                        type: 'error',
                        duration: 10000,
                        text: 'No Token Amount'
                    });

                    this.tokenAmount = 1;
                    return;
                }

                let lastApproved = this.userLastApprovedContractAddress;

                IntelService.rewardIntel(
                    {title, ID, tokenAmount, intelAddress, lastApproved, address: this.address},
                    {signType: this.signType, pathId: this.pathId},
                    {
                        addTransaction: this.addTransaction,
                        transactionComplete: this.transactionComplete,
                        editTransaction: this.editTransaction,
                        toastTransaction: this.$notify
                    },
                    res => {
                        this.$notify({
                            group: 'notification',
                            type: 'success',
                            duration: 10000,
                            title: 'Event: Reward',
                            text: 'Confirmed Reward'
                        });
                    },
                    err => {
                        this.$notify({
                            group: 'notification',
                            type: 'error',
                            duration: 10000,
                            text: err.message ? err.message : err
                        });
                    }
                );
            },
        }
    }
</script>

<style scoped>

</style>