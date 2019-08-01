import * as React from 'react';
import { FunctionComponent, useEffect, useState } from 'react';
import { bMessage, popupHeader, fullHeader, i18n } from './common';
import { Ad, Settings, Channel } from '../typings';
import Link from './link';

const AdItem: FunctionComponent<{
    ad: Ad;
    muted: boolean;
    blocked: boolean;
    full: boolean;
}> = ({ ad, muted, blocked, full }) => {
    let url = '';
    const matches = ad.details.url.match(/\&video_id=([A-Za-z_\-0-9]+)\&/);
    
    if (matches && matches.length > 1) {
        const videoId = matches[1];
        url = 'http://www.youtube.com/watch?v=' + videoId;
    }

    const channelURL = 'http://www.youtube.com/channel/' + ad.channelId.id;

    const onMute = () => {
        bMessage('set', 'add-mute', ad.channelId);
    }
    const onBlock = () => {
        bMessage('set', 'add-black', ad.channelId)
    }

    return <tr>
        <td>
            <Link className='font-weight-bold-sm' href={channelURL}>{ad.author}</Link>
        </td>
        {full && <td>
            <Link href={url}>{ad.title}</Link>
        </td>}
        {full && <td>
            <div className='d-flex align-items-center'>
                {ad.blocked
                    ? <><i className='fas fa-video-slash mr-1' /><span className='d-inline-block'>{i18n('adBlocked')}</span></>
                    : <><i className='fas fa-video mr-1' /><span className='d-inline-block'>{i18n('adAllowed')}</span></>}
            </div>
        </td>}
        <td>
            <div className='d-flex justify-content-flex-end'>
                <button
                    className='btn btn-outline-secondary d-sm-none d-md-inline-block'
                    onClick={onMute}
                    disabled={muted}
                    title={i18n('muteAdvertiserTooltip')}>
                    <i className='fas fa-volume-mute' />
                </button>
                <button
                    className={'btn ' + (full ? 'btn-outline-danger' : 'btn-link text-danger float-right')}
                    onClick={onBlock}
                    disabled={blocked}
                    title={i18n('blockAdvertiserTooltip')}>
                    <i className='fas fa-ban' />
                </button>
            </div>
        </td>
    </tr>
}

const RecentAds: FunctionComponent<{
    full: boolean;
    settings: Settings;
}> = ({ full, settings }) => {
    const [ads, setAds] = useState([] as Array<Ad>);

    useEffect(() => {
        bMessage('get', 'ads').then((ads: Array<Ad>) => {
            console.log('Ads: ', ads);
            setAds(full ? ads : ads.slice(Math.max(ads.length - 5, 0), ads.length));
        })
    }, [])

    const isBlocked = (channel: Channel) => settings.blacklisted.findIndex(({ id }) => id === channel.id) !== -1;
    const isMuted = (channel: Channel) => settings.muted.findIndex(({ id }) => id === channel.id) !== -1;

    return <>
        {full
            ? fullHeader(i18n('adsHeaderShort'))
            : popupHeader(i18n('adsHeaderLong'))}
        <table className='table table-striped table-sm'>
            <thead className='thead-dark d-sm-none d-md-table-header-group'>
                <tr>
                    <th>{i18n('advertiserColumn')}</th>
                    {full && <th>{i18n('videoColumn')}</th>}
                    <th>{i18n('statusColumn')}</th>
                    {full && <th>{i18n('actionColumn')}</th>}
                </tr>
            </thead>
            <tbody>
                {!ads.length && <tr>
                    <td className='text-muted'>{i18n('emptyList')}</td>
                    {full && <td></td>}
                    <td></td>
                    {full && <td></td>}
                </tr>}
                {ads.map(ad => <AdItem
                    muted={isMuted(ad.channelId)}
                    blocked={isBlocked(ad.channelId)}
                    key={ad.timestamp}
                    ad={ad}
                    full={full} />)}
            </tbody>
        </table>
    </>
}

export default RecentAds;