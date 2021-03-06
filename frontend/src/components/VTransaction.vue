<template>
  <div class="text-center position-relative">
          <div class="row ml-0 mr-0 py-2 cursor-pointer border-bottom text-content" :style="getProgress(ini, mid)">
            <div class="col-1 px-0" @click="clickTransaction()">
              <font-awesome-icon v-if="transaction.event === 'create'" :icon="['fas', 'seedling']"
                                 :class="statusColor(transaction.status)"></font-awesome-icon>
              <font-awesome-icon v-else-if="transaction.event === 'reward'" :icon="['fas', 'coins']"
                                 :class="statusColor(transaction.status)"></font-awesome-icon>
            </div>
            <div class="col-3 px-0 text-left">
              <a v-bind:href="etherscanUrl+'/tx/'+transaction.txHash"
                 target="_blank" class="col-2 px-0 pl-1">
                {{transaction.amount}}
              </a>
            </div>
            <div class="col-1 text-left" @click="clickTransaction()">
              <font-awesome-icon :icon="['fas', 'arrow-alt-circle-right']"
                                 :class="statusColor(transaction.status)"></font-awesome-icon>
            </div>
            <p class="col-5 px-0 pl-1 ellipsis">
              <a v-bind:href="etherscanUrl+'/tx/'+transaction.txHash" target="_blank">
                {{ intelTitle(transaction) }}
              </a>
              <!-- use intelData.address / transaction.txHash to pass into IntelDetail view to force it to load this object -->
            </p>
          </div>
    </div>

</template>

<script>
  import ICountUp from "vue-countup-v2";
  import moment from "moment";
  import {mapState, mapActions} from "vuex";

  import {countUpMixin} from "../mixins/countUp";
  import IntelService from "../services/IntelService";

  export default {
    name: "VTransaction",
    props: [
      "transaction", "creatingLoading"
    ],
    mixins: [countUpMixin],
    components: {
      ICountUp
    },
    data: function () {
      return {
        ini: 0,
         mid: 0,
        blue: 100,
          darkBlue: 100,
          etherscanUrl: window.localStorage.getItem('etherscan'),
        loadingEffect: {},
        clicked: false
      }
    },
    filters: {
      dateFilter: function formatDate(date) {
        const temp = moment(date);
        return temp.format("MMMM Do, YYYY");
      }
    },
    watch: {
        transaction: function(tx){
            if(this.ini ===0 ){
                this.updateLinearGradient();
             }
        }
    },
    mounted: function () {
      let newId = this.transaction.txHash + '-span';
      this.clicked = this.transaction.clicked;
      this.loadingEffect = document.getElementById(newId);
      this.updateLinearGradient()
    },
    methods: {
      ...mapActions(["addTransaction", "transactionComplete", "assignTransactions", "editTransaction"]),
      clickTransaction(){
        if (this.transaction.status >= 3) {

          let transactionText = 'This transaction was already completed';
          let title = 'Transaction Completed';
          let type = 'warning';

          if (this.transaction.status === 4) {
            transactionText = 'This transaction failed';
            title = ' Transaction Failed';
            type = 'error';
          }

          this.$notify({
            group: 'notification',
            type: type,
            title: title,
            duration: 10000,
            text: transactionText
          });
          return;
        }

        if (!this.transaction.clicked) {
          this.clicked = true;
          this.$set(this.transaction, 'clicked', true);

          this.editTransaction({hash: this.transaction.txHash, key: 'clicked', value: 'true'});

          IntelService.pendingTransactionApproval(
            this.transaction,
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
                title: 'Event: ' + this.transaction.event,
                text: 'Confirmed ' + this.transaction.event
              });
            },
            err => {
              this.$notify({
                group: 'notification',
                type: 'error',
                duration: 10000,
                text: err.message ? err.message : err
              });
            });
        } else {
          this.$notify({
            group: 'notification',
            type: 'warning',
            title: 'Your transaction is being processed',
            duration: 10000,
            text: 'Wait for the process to complete'
          });
        }
      },
      dateStringFormat(date) {
        return new Date(date);
      },
        updateLinearGradient(){
            if (this.transaction.event === 'reward' && this.transaction.status === 3 && this.transaction.intelData && this.transaction.intelData.reward){
                this.blue =Math.min(((this.transaction.amount|| 0)/this.transaction.intelData.reward)*100,100);
                if (this.transaction.minBlock && this.transaction.block){
                    if(this.transaction.block > this.transaction.minBlock){
                        this.blue = this.blue*(this.transaction.block - this.transaction.minBlock)/this.transaction.exponentBlock;
                    }else{
                        this.blue=0;
                    }
                }else{
                    this.blue=0;
                }
                if(this.blue> 50){
                    this.mid = 99.5;
                }
                this.updateBlue()

            }
        }
        ,
        updateBlue() {
          if(this.blue<=50) {
              if (this.mid < this.blue) {
                  this.mid = this.mid + 0.5;
                  this.ini = this.mid - this.mid*0.05;
                  setTimeout(this.updateBlue, Math.random() * (50 - 10) + 10)
              }
          }else if (this.blue > 50 && this.blue <= 99) {
              if (this.mid > this.blue) {
                  this.mid = this.mid - 0.5;
                  this.ini = this.mid - this.mid*0.05;
                  setTimeout(this.updateBlue, Math.random() * (50 - 10) + 10)
              }
          }
          else { //blue > 99
            this.mid = 99.5;
            this.ini = 99.5;
            setTimeout(this.updateBlue, Math.random() * (50 - 10) + 10)
          }
        },
      intelTitle(transaction){
        return transaction.intelData? transaction.intelData.title : transaction.txHash;
      },
      statusColor(status) {
        let click = this.clicked || this.transaction.clicked;
        return {
          'red-background': status == 4 || status < 3 && !click,
          'green-background': status == 3,
          'yellow-background': status < 3 && click
        };
      },
      getProgress(ini, mid) {
          const style = {
              "border-bottom-color": "black !important"
          };
          if (this.transaction.event === 'reward' && this.transaction.status === 3 && this.transaction.intelData && this.transaction.intelData.reward) {
              style.background = 'linear-gradient(90deg, #679ab4 ' +  ini + '%, #1f344f ' + mid + '% , #1f344f )';
          }

          return style;
      }
    }
  }
</script>
<style>
</style>