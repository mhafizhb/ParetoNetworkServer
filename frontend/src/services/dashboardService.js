import http from './HttpService';

export default class dashboardService {
    static getAddress(onSuccess, onError) {
        http.get('/v1/address', {
            withCredentials: true
        }).then(res => {
            if(res.data.success){
                return onSuccess(res.data.data);
            }else{
                return onError(res.data.message);
            }
        }).catch(error => {
            return onError(error);
        });
    }

    static getContent(onSuccess, onError) {
        http.get('/v1/content/me').then(res => {
            if(res.data.success){
                return onSuccess(res.data.data);
            }else{
                return onError(res.data.message);
            }
        }).catch(error => {
            return onError(error)
        });
    }
    static getAllContent(onSuccess, onError) {
        http.get('/v1/content').then(res => {
            if(res.data.success){
                return onSuccess(res.data.data);
            }else{
                return onError(res.data.message);
            }
        }).catch(error => {
            return onError(error)
        });
    }
}