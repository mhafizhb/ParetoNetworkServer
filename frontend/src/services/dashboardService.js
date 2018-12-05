import http from './HttpService';

export default class dashboardService {

    static getAddress(onSuccess, onError) {
        console.log(this.getAddress.address);
        if (this.getAddress.address) {
            return onSuccess(this.getAddress.address);
        } else {
            return http.get('/v1/address', {
                withCredentials: true
            }).then(res => {
                let response = res.data;
                this.getAddress.address = response.data;

                if (response.success)
                    return onSuccess(response.data);
                else
                    return onError(response.message);

            }).catch(error => {
                return onError(error);
            });
        }
    }

    // static getIntel(onSuccess, onError) {
    //     http.get('/intel', {
    //         withCredentials: true
    //     }).then(res => {
    //         if(res.data.success){
    //             return onSuccess(res.data.data);
    //         }else{
    //             return onError(res.data.message);
    //         }
    //     }).catch(error => {
    //         return onError(error);
    //     });
    // }

    static getIntel(intel, onSuccess, onError) {
        return http.get('/v1/content/' + intel).then(res => {
            if (res.data.success) {
                return onSuccess(res.data.data);
            } else {
                return onError(res.data.message);
            }
        }).catch(error => {
            return onError(error)
        });
    }

    static getContent(params, onSuccess, onError) {
        let query = '';
        if (params) {
            query = '?limit=' + params.limit + '&page=' + params.page + '&user=' + params.user;
        }

        return http.get('/v1/content/me' + query).then(res => {
            if (res.data.success) {
                return onSuccess(res.data.data);
            } else {
                return onError(res.data.message);
            }
        }).catch(error => {
            return onError(error)
        });
    }

    static getAllContent(params, onSuccess, onError) {
        const {limit, page} = params || {limit: 10, page: 0};
        let query_params = window.location.hash.split('?');
        let total_query = ""
        if (query_params.length > 0) {
            total_query = "&" + query_params[1];
        }
        return http.get('/v1/content?limit=' + limit + '&page=' + page + total_query).then(res => {
            //console.log(res);
            if (res.data.success) {
                return onSuccess(res.data.data);
            } else {
                return onError(res.data.message);
            }
        }).catch(error => {
            return onError(error)
        });
    }
}