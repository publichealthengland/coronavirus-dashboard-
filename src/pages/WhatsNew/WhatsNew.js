// @flow

import React  from 'react';

import useGenericAPI from 'hooks/useGenericAPI';

import Loading from "components/Loading";
import BrowserHistory from "components/BrowserHistory";
import ChangeLogComponent from "components/ChangeLogComponent";

const WhatsNew = () => {

    const data = useGenericAPI("changeLogData", [], "json");

    if ( !data ) return <Loading/>;

    return <BrowserHistory>
        <ChangeLogComponent data={data?.changeLog ?? []} colours={ data?.colours ?? [] }/>
    </BrowserHistory>

}; // ChangeLog


export default WhatsNew;