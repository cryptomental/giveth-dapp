import React, { Component } from 'react';
import { Prompt } from 'react-router-dom';
import PropTypes from 'prop-types';
import { Form, Input } from 'formsy-react-components';

import GA from 'lib/GoogleAnalytics';
import Loader from '../Loader';
import QuillFormsy from '../QuillFormsy';
import FormsyImageUploader from '../FormsyImageUploader';
import GoBackButton from '../GoBackButton';
import { isOwner, getTruncatedText, history } from '../../lib/helpers';
import { isAuthenticated, checkWalletBalance, isInWhitelist } from '../../lib/middleware';
import LoaderButton from '../LoaderButton';

import DACservice from '../../services/DACService';
import DAC from '../../models/DAC';
import User from '../../models/User';
import GivethWallet from '../../lib/blockchain/GivethWallet';
import ErrorPopup from '../ErrorPopup';

/**
 * View to create or edit a DAC
 *
 * @param isNew    If set, component will load an empty model.
 *                 Otherwise component expects an id param and will load a DAC object
 * @param id       URL parameter which is an id of a campaign object
 * @param history  Browser history object
 * @param wallet   Wallet object with the balance and all keystores
 */
class EditDAC extends Component {
  constructor(props) {
    super(props);

    this.state = {
      isLoading: true,
      isSaving: false,
      formIsValid: false,

      // DAC model
      dac: new DAC({
        owner: props.currentUser,
      }),
      isBlocking: false,
    };

    this.form = React.createRef();

    this.submit = this.submit.bind(this);
    this.setImage = this.setImage.bind(this);
  }

  componentDidMount() {
    isAuthenticated(this.props.currentUser, this.props.wallet)
      .then(() => isInWhitelist(this.props.currentUser, React.whitelist.delegateWhitelist))
      .then(() => checkWalletBalance(this.props.wallet))
      .then(() => {
        if (!this.props.isNew) {
          DACservice.get(this.props.match.params.id)
            .then(dac => {
              // The user is not an owner, hence can not change the DAC
              if (!isOwner(dac.owner.address, this.props.currentUser)) {
                // TODO: Not really user friendly
                history.goBack();
              } else {
                this.setState({ isLoading: false, dac });
              }
            })
            .catch(err => {
              ErrorPopup(
                'Sadly we were unable to load the DAC. Please refresh the page and try again.',
                err,
              );
            });
        } else {
          this.setState({ isLoading: false });
        }
      })
      .catch(err => {
        ErrorPopup(
          'There has been a problem loading the DAC. Please refresh the page and try again.',
          err,
        );
      });
    this.mounted = true;
  }

  componentWillUnmount() {
    this.mounted = false;
  }

  setImage(image) {
    const { dac } = this.state;
    dac.image = image;
    this.setState({ dac });
  }

  submit() {
    // Save dac
    const showToast = (msg, url, isSuccess = false) => {
      const toast = url ? (
        <p>
          {msg}
          <br />
          <a href={url} target="_blank" rel="noopener noreferrer">
            View transaction
          </a>
        </p>
      ) : (
        msg
      );

      if (isSuccess) React.toast.success(toast);
      else React.toast.info(toast);
    };

    const afterMined = (created, url, id) => {
      const msg = `Your DAC has been ${created ? 'created' : 'updated'}`;
      showToast(msg, url, true);

      if (created) {
        GA.trackEvent({
          category: 'DAC',
          action: 'created',
          label: id,
        });
      } else {
        if (this.mounted) this.setState({ isSaving: false });
        GA.trackEvent({
          category: 'DAC',
          action: 'updated',
          label: id,
        });
        history.push(`/dacs/${id}`);
      }
    };
    const afterSave = (created, url) => {
      if (this.mounted) this.setState({ isSaving: false });

      const msg = created ? 'Your DAC is pending...' : 'Your DAC is being updated...';
      showToast(msg, url);

      if (created) history.push('/my-dacs');
    };

    this.setState(
      {
        isSaving: true,
        isBlocking: false,
      },
      () => {
        // Save the DAC
        this.state.dac.save(afterSave, afterMined);
      },
    );
  }

  toggleFormValid(state) {
    this.setState({ formIsValid: state });
  }

  triggerRouteBlocking() {
    const form = this.form.current.formsyForm;
    // we only block routing if the form state is not submitted
    this.setState({ isBlocking: form && (!form.state.formSubmitted || form.state.isSubmitting) });
  }

  render() {
    const { isNew } = this.props;
    const { isLoading, isSaving, dac, formIsValid, isBlocking } = this.state;

    return (
      <div id="edit-dac-view">
        <div className="container-fluid page-layout edit-view">
          <div>
            <div className="col-md-8 m-auto">
              {isLoading && <Loader className="fixed" />}

              {!isLoading && (
                <div>
                  <GoBackButton history={history} />

                  <div className="form-header">
                    {isNew && <h3>Start a Decentralized Altruistic Community (DAC)</h3>}

                    {!isNew && <h3>Edit DAC</h3>}

                    <p>
                      <i className="fa fa-question-circle" />
                      A DAC aims to solve a cause by building a Community, raising funds and
                      delegating those funds to Campaigns that solve its cause. Should you create a
                      Campaign or Community? Read more{' '}
                      <a
                        target="_blank"
                        rel="noopener noreferrer"
                        href="https://wiki.giveth.io/documentation/glossary/"
                      >
                        here
                      </a>.
                    </p>
                  </div>

                  <Form
                    onSubmit={this.submit}
                    ref={this.form}
                    mapping={inputs => {
                      dac.title = inputs.title;
                      dac.description = inputs.description;
                      dac.communityUrl = inputs.communityUrl;
                      dac.summary = getTruncatedText(inputs.description, 100);
                    }}
                    onValid={() => this.toggleFormValid(true)}
                    onInvalid={() => this.toggleFormValid(false)}
                    onChange={e => this.triggerRouteBlocking(e)}
                    layout="vertical"
                  >
                    <Prompt
                      when={isBlocking}
                      message={() =>
                        `You have unsaved changes. Are you sure you want to navigate from this page?`
                      }
                    />

                    <Input
                      name="title"
                      id="title-input"
                      label="Community cause"
                      type="text"
                      value={dac.title}
                      placeholder="e.g. Hurricane relief."
                      help="Describe your Decentralized Altruistic Community (DAC) in 1 sentence."
                      validations="minLength:3"
                      validationErrors={{
                        minLength: 'Please provide at least 3 characters.',
                      }}
                      required
                      autoFocus
                    />

                    <div className="form-group">
                      <QuillFormsy
                        name="description"
                        label="Explain how you are going to solve this your cause"
                        helpText="Make it as extensive as necessary. Your goal is to build trust,
                        so that people join your Community and/or donate Ether."
                        value={dac.description}
                        placeholder="Describe how you're going to solve your cause..."
                        validations="minLength:20"
                        help="Describe your dac."
                        validationErrors={{
                          minLength: 'Please provide at least 10 characters.',
                        }}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <FormsyImageUploader
                        name="image"
                        setImage={this.setImage}
                        previewImage={dac.image}
                        isRequired={isNew}
                      />
                    </div>

                    <div className="form-group">
                      <Input
                        name="communityUrl"
                        id="community-url"
                        label="Url to join your community"
                        type="text"
                        value={dac.communityUrl}
                        placeholder="https://slack.giveth.com"
                        help="Where can people join your community? Paste a link here for your community's website, social or chatroom."
                        validations="isUrl"
                        validationErrors={{
                          isUrl: 'Please provide a url.',
                        }}
                      />
                    </div>

                    <div className="form-group row">
                      <div className="col-6">
                        <GoBackButton history={history} />
                      </div>
                      <div className="col-6">
                        <LoaderButton
                          className="btn btn-success pull-right"
                          formNoValidate
                          type="submit"
                          disabled={isSaving || !formIsValid || (dac.id && dac.delegateId === 0)}
                          isLoading={isSaving}
                          loadingText="Saving..."
                        >
                          {isNew ? 'Create DAC' : 'Update DAC'}
                        </LoaderButton>
                      </div>
                    </div>
                  </Form>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
}

EditDAC.propTypes = {
  currentUser: PropTypes.instanceOf(User).isRequired,
  isNew: PropTypes.bool,
  wallet: PropTypes.instanceOf(GivethWallet).isRequired,
  match: PropTypes.shape({
    params: PropTypes.shape({
      id: PropTypes.string,
    }).isRequired,
  }).isRequired,
};

EditDAC.defaultProps = {
  isNew: false,
};

export default EditDAC;
